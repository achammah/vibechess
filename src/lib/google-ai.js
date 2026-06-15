import { GoogleGenAI, createPartFromFunctionResponse } from "@google/genai";

// Re-export the Gemini catalog from the centralized model registry so existing
// `import { GEMINI_MODELS } from "@/lib/google-ai"` call sites keep working.
export { GEMINI_MODELS } from "./models";

// ── System prompt ────────────────────────────────────────────────────────────
const GM_SYSTEM_PROMPT = `You are a patient, encouraging chess teacher at Grandmaster level working one-on-one with a student.

Default behaviour — ALWAYS follow these unless the student explicitly says otherwise:
- Be concise: concise response. Go deeper only when explicitly asked.
- NEVER move pieces or change the board position unless the student explicitly requests it (e.g. "show me", "play the move", "demonstrate", "set up a position").
- Answer exactly what was asked. Do not volunteer unrequested analysis or board changes.
- Write candidate moves inline (e.g. "Consider 1.e4 e5 2.Nf3") instead of playing them on the board.
- Match your vocabulary and depth to the student's ELO.
- Encourage the student and frame every mistake as a learning opportunity.

Board tools (set_board_position, make_move, flip_board) are available but must ONLY be used when the student explicitly asks for a live demonstration or interactive walkthrough. Do not call them for routine analysis, thought-process explanations, or hints.`;

// ── Chess action tool declarations ───────────────────────────────────────────
const CHESS_TOOLS = [
  {
    name: "set_board_position",
    description:
      "Set the chess board to a specific position using FEN notation. Use this to demonstrate openings, show tactical positions, or set up puzzles and teaching scenarios.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        fen: {
          type: "string",
          description: "Valid FEN string representing the board position",
        },
        explanation: {
          type: "string",
          description:
            "Brief explanation of what position is being set and why",
        },
      },
      required: ["fen", "explanation"],
    },
  },
  {
    name: "make_move",
    description:
      "Play a chess move on the board in Standard Algebraic Notation. Use this to play through opening lines, demonstrate tactics, or show the best move in a position.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        san: {
          type: "string",
          description:
            'Move in Standard Algebraic Notation (e.g. "e4", "Nf3", "O-O", "Bxe5+")',
        },
        explanation: {
          type: "string",
          description: "The idea or purpose behind this move",
        },
      },
      required: ["san", "explanation"],
    },
  },
  {
    name: "flip_board",
    description:
      "Flip the chess board to show a different perspective (white or black side at the bottom)",
    parametersJsonSchema: {
      type: "object",
      properties: {
        orientation: {
          type: "string",
          enum: ["white", "black"],
          description: "Which side to show at the bottom of the board",
        },
      },
      required: ["orientation"],
    },
  },
];

// ── Convert OpenAI-format messages → Google AI format ────────────────────────
const toGoogleContents = (messages) =>
  messages
    .filter(
      (message) =>
        typeof message?.content === "string" &&
        (message.role === "assistant" || message.role === "user"),
    )
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));

// Low-latency thinking config, per model family. Gemini 3.x models use
// `thinkingLevel` ("minimal" ≈ effectively off, lowest latency) and IGNORE the
// older `thinkingBudget` param — sending only thinkingBudget leaves a 3.x model
// at its default "medium" thinking, which adds many seconds of latency and makes
// interactive coach calls time out. Gemini 2.5 models use `thinkingBudget: 0` to
// disable thinking. This builds the right config so either family answers fast.
const lowLatencyThinkingConfig = (model) =>
  /gemini-3/.test(model || "")
    ? { thinkingLevel: "minimal" }
    : { thinkingBudget: 0 };

const getResponseContent = (response) => response.candidates?.[0]?.content;

const getFunctionCalls = (response) =>
  (response.functionCalls || []).filter((call) => call?.name);

const asString = (value, fallback = "") =>
  typeof value === "string" ? value : fallback;

const createGoogleClient = (apiKey) => new GoogleGenAI({ apiKey });

const formatSummarySourceMessages = (messages) =>
  messages
    .filter((message) => typeof message?.content === "string")
    .map((message) => {
      const role = message.role === "assistant" ? "Assistant" : "User";
      return `${role}: ${message.content.trim()}`;
    })
    .join("\n\n");

export const summarizeGoogleConversation = async ({
  messages,
  existingSummary = "",
  apiKey,
  model = "gemini-3.5-flash",
}) => {
  if (!apiKey) {
    throw new Error("Please set your Google API key in Settings.");
  }

  const ai = createGoogleClient(apiKey);
  const sourceMessages = formatSummarySourceMessages(messages);

  const response = await ai.models.generateContent({
    model,
    config: {
      maxOutputTokens: 220,
      temperature: 0.2,
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              "Compress this chess coaching conversation into a compact running summary.",
              "Preserve only stable context that matters for future turns:",
              "- user goals or questions",
              "- strategic themes and plans discussed",
              "- concrete move ideas or lines worth remembering",
              "- unresolved follow-up questions",
              "Do not preserve transient FEN details because live board state is sent separately every turn.",
              "Return markdown with these headings only:",
              "## Goals",
              "## Key Ideas",
              "## Open Questions",
              "Keep it short and dense.",
              "",
              "Existing summary:",
              existingSummary || "None",
              "",
              "New conversation slice:",
              sourceMessages || "None",
            ].join("\n"),
          },
        ],
      },
    ],
  });

  return response.text?.trim() || existingSummary;
};

/**
 * Send a message to Google Gemini with chess board action tool support.
 *
 * The model can call board action tools mid-conversation.
 * `onAction` is called immediately for each action so the board updates live.
 * @returns {{ text: string, actions: Array, usageMetadata: object | null }} Generated reply text, emitted board actions, and Gemini usage metadata when available.
 */
export const sendGoogleChatMessage = async ({
  messages,
  fen,
  elo = 1000,
  apiKey,
  model = "gemini-3.5-flash",
  onAction,
}) => {
  if (!apiKey) throw new Error("Please set your Google API key in Settings.");

  const ai = createGoogleClient(apiKey);

  const systemInstruction = `${GM_SYSTEM_PROMPT}

Reason from the latest board context provided in every user turn. Treat that live position as the source of truth.
Only use board tools when changing the board will genuinely help the lesson.
If you use a board tool, briefly explain why before or after the action.

Current board position (FEN): ${fen}
Student ELO: ~${elo}`;

  const config = {
    tools: [{ functionDeclarations: CHESS_TOOLS }],
  };

  let contents = toGoogleContents(messages);
  const actions = [];
  let toolTurns = 0;

  // ── Agentic loop: run until no more function calls ────────────────────────
  let response = await ai.models.generateContent({
    model,
    systemInstruction,
    contents,
    config,
  });

  while (toolTurns < 8) {
    const functionCalls = getFunctionCalls(response);
    if (functionCalls.length === 0) break;

    const modelContent = getResponseContent(response);
    if (!modelContent) {
      throw new Error("Gemini returned tool calls without model content.");
    }

    const functionResponseParts = [];

    for (const [index, call] of functionCalls.entries()) {
      const { name, args: functionArguments = {}, id } = call;
      let actionResult = "Action executed.";

      if (name === "set_board_position") {
        const action = {
          type: "SET_POSITION",
          fen: asString(functionArguments.fen),
          explanation: asString(
            functionArguments.explanation,
            "Teaching position loaded.",
          ),
        };
        actions.push(action);
        onAction?.(action);
        actionResult = `Position loaded: ${action.fen}`;
      } else if (name === "make_move") {
        const action = {
          type: "MAKE_MOVE",
          san: asString(functionArguments.san),
          explanation: asString(
            functionArguments.explanation,
            "Demonstration move played.",
          ),
        };
        actions.push(action);
        onAction?.(action);
        actionResult = `Move ${action.san} played on the board.`;
      } else if (name === "flip_board") {
        const action = {
          type: "FLIP_BOARD",
          orientation: asString(functionArguments.orientation, "white"),
        };
        actions.push(action);
        onAction?.(action);
        actionResult = `Board flipped to ${action.orientation} view.`;
      } else {
        actionResult = `Unknown action requested: ${name}`;
      }

      functionResponseParts.push(
        createPartFromFunctionResponse(id || `${name}-${index + 1}`, name, {
          result: actionResult,
          ok: !actionResult.startsWith("Unknown"),
        }),
      );
    }

    // Extend contents with the full model turn to preserve SDK-managed parts.
    contents = [
      ...contents,
      modelContent,
      {
        role: "user",
        parts: functionResponseParts,
      },
    ];

    response = await ai.models.generateContent({
      model,
      systemInstruction,
      contents,
      config,
    });

    toolTurns += 1;
  }

  if (toolTurns === 8 && getFunctionCalls(response).length > 0) {
    throw new Error("Gemini exceeded the board-action limit for one reply.");
  }

  return {
    text: response.text || "",
    actions,
    usageMetadata: response.usageMetadata || null,
  };
};

/**
 * One-shot grounded explanation: the model verbalizes the engine evidence only.
 * No board-action tools and no JSON — the caller draws arrows itself in code.
 * Returns the raw reply text (plain prose).
 * @param {object} a
 * @param {string} a.instruction        system instruction
 * @param {string} a.evidenceText       grounded evidence block
 * @param {string} a.task               the specific task line
 * @param {string} a.apiKey             Google API key
 * @param {string} [a.model]            Gemini model id
 * @param {number} [a.temperature]      sampling temperature
 * @param {number} [a.maxOutputTokens]  output token cap
 * @param {number} [a.thinkingBudget]   thinking-model reasoning budget; pass 0 to
 *                                       disable reasoning for a fast, direct answer
 */
export const explainGrounded = async ({
  instruction,
  evidenceText,
  task,
  apiKey,
  model = "gemini-3.5-flash",
  temperature = 0.3,
  maxOutputTokens = 700,
  thinkingBudget,
}) => {
  if (!apiKey) throw new Error("Please set your Google API key in Settings.");
  const ai = createGoogleClient(apiKey);
  const contents = [
    { role: "user", parts: [{ text: `TASK: ${task}\n\n${evidenceText}` }] },
  ];
  const baseConfig = { temperature, maxOutputTokens };

  // When a thinkingBudget is provided, disable/limit the thinking model's
  // reasoning for a faster, more direct answer. If the SDK/model rejects the
  // thinkingConfig field, retry once without it so we never lose the answer.
  if (thinkingBudget != null) {
    try {
      const response = await ai.models.generateContent({
        model,
        systemInstruction: instruction,
        config: { ...baseConfig, thinkingConfig: lowLatencyThinkingConfig(model) },
        contents,
      });
      return response.text || "";
    } catch {
      // fall through to a plain call without thinkingConfig
    }
  }

  const response = await ai.models.generateContent({
    model,
    systemInstruction: instruction,
    config: baseConfig,
    contents,
  });
  return response.text || "";
};

/**
 * Structured JSON generation. Forces the model to emit JSON matching `schema`
 * via responseMimeType + responseSchema, parses it, and returns the parsed
 * object. Throws on a missing key, an empty reply, or unparseable JSON.
 *
 * gemini-3.5-flash is a thinking model; passing thinkingBudget (e.g. 0) disables
 * its reasoning for a faster answer. If the model rejects thinkingConfig we retry
 * once without it so the structured answer is never lost.
 *
 * @param {object} a
 * @param {string} a.instruction        system instruction
 * @param {string} a.prompt             the user prompt / evidence + task
 * @param {object} a.schema             responseSchema (OpenAPI-subset JSON schema)
 * @param {string} a.apiKey             Google API key
 * @param {string} [a.model]            Gemini model id
 * @param {number} [a.temperature]      sampling temperature
 * @param {number} [a.maxOutputTokens]  output token cap
 * @param {number} [a.thinkingBudget]   thinking-model reasoning budget; pass 0 to disable
 * @returns {Promise<object>} parsed JSON object matching the schema
 */
export const generateJson = async ({
  instruction,
  prompt,
  schema,
  apiKey,
  model = "gemini-3.5-flash",
  temperature = 0.3,
  maxOutputTokens = 1024,
  thinkingBudget,
}) => {
  if (!apiKey) throw new Error("Please set your Google API key in Settings.");
  const ai = createGoogleClient(apiKey);
  const contents = [{ role: "user", parts: [{ text: prompt }] }];
  const baseConfig = {
    temperature,
    maxOutputTokens,
    responseMimeType: "application/json",
    responseSchema: schema,
  };

  const call = async (config) => {
    const response = await ai.models.generateContent({
      model,
      systemInstruction: instruction,
      config,
      contents,
    });
    return response.text || "";
  };

  let raw = "";
  if (thinkingBudget != null) {
    try {
      raw = await call({ ...baseConfig, thinkingConfig: lowLatencyThinkingConfig(model) });
    } catch {
      // thinkingConfig rejected — fall through to a plain call below
    }
  }
  if (!raw) raw = await call(baseConfig);

  if (!raw) throw new Error("Gemini returned an empty JSON reply.");
  // Tolerate a stray ```json fence if the model wraps the payload.
  const cleaned = raw.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  return JSON.parse(cleaned);
};

/**
 * Lightweight multi-turn chat generation. No tools, no JSON, no board actions —
 * just a grounded prose reply. Used by the opening coach's follow-up chat.
 * Returns the raw reply text. Throws on a missing key or empty reply.
 *
 * @param {object} a
 * @param {string} a.instruction        system instruction
 * @param {Array<{role:string,content:string}>} [a.history] prior chat turns
 * @param {string} a.message            the latest user message (already grounded)
 * @param {string} a.apiKey             Google API key
 * @param {string} [a.model]            Gemini model id
 * @param {number} [a.temperature]      sampling temperature
 * @param {number} [a.maxOutputTokens]  output token cap
 * @param {number} [a.thinkingBudget]   thinking-model reasoning budget; pass 0 to disable
 * @returns {Promise<string>} reply text
 */
export const generateChat = async ({
  instruction,
  history = [],
  message,
  apiKey,
  model = "gemini-3.5-flash",
  temperature = 0.4,
  maxOutputTokens = 600,
  thinkingBudget,
}) => {
  if (!apiKey) throw new Error("Please set your Google API key in Settings.");
  const ai = createGoogleClient(apiKey);
  const contents = [
    ...toGoogleContents(history),
    { role: "user", parts: [{ text: message }] },
  ];
  const baseConfig = { temperature, maxOutputTokens };

  const call = async (config) => {
    const response = await ai.models.generateContent({
      model,
      systemInstruction: instruction,
      config,
      contents,
    });
    return response.text || "";
  };

  // Minimize thinking for a fast reply when asked; retry without it if rejected.
  if (thinkingBudget != null) {
    try {
      const raw = await call({
        ...baseConfig,
        thinkingConfig: lowLatencyThinkingConfig(model),
      });
      if (raw) return raw;
    } catch {
      // fall through to a plain call
    }
  }
  return call(baseConfig);
};
