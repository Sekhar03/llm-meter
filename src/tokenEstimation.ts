export function estimateTextTokens(text: string): number {
  if (!text) return 0;
  // Standard approximation: ~4 characters per token
  return Math.ceil(text.length / 4);
}

export function extractOpenAiText(request: any): string {
  if (!request) return "";
  let text = "";

  if (typeof request.prompt === "string") {
    text += request.prompt;
  } else if (Array.isArray(request.prompt)) {
    text += request.prompt.join(" ");
  }

  if (Array.isArray(request.messages)) {
    for (const msg of request.messages) {
      if (typeof msg.content === "string") {
        text += msg.content + " ";
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part && part.type === "text" && typeof part.text === "string") {
            text += part.text + " ";
          }
        }
      }
    }
  }

  return text.trim();
}

export function extractAnthropicText(request: any): string {
  if (!request) return "";
  let text = "";

  if (typeof request.system === "string") {
    text += request.system + " ";
  } else if (Array.isArray(request.system)) {
    for (const sys of request.system) {
      if (sys && sys.type === "text" && typeof sys.text === "string") {
        text += sys.text + " ";
      }
    }
  }

  if (Array.isArray(request.messages)) {
    for (const msg of request.messages) {
      if (typeof msg.content === "string") {
        text += msg.content + " ";
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part && part.type === "text" && typeof part.text === "string") {
            text += part.text + " ";
          }
        }
      }
    }
  }

  return text.trim();
}

export function extractGeminiText(request: any): string {
  if (!request) return "";
  let text = "";

  const contents = request.contents;
  if (Array.isArray(contents)) {
    for (const content of contents) {
      if (content && Array.isArray(content.parts)) {
        for (const part of content.parts) {
          if (part && typeof part.text === "string") {
            text += part.text + " ";
          }
        }
      }
    }
  }

  const systemInstruction = request.systemInstruction;
  if (systemInstruction) {
    if (typeof systemInstruction === "string") {
      text += systemInstruction + " ";
    } else if (Array.isArray(systemInstruction.parts)) {
      for (const part of systemInstruction.parts) {
        if (part && typeof part.text === "string") {
          text += part.text + " ";
        }
      }
    }
  }

  return text.trim();
}
