import { defineEngineMeta } from "../engineMeta";

export const llmProviderEndpoints: Record<string, string> = {
  custom: "",
  openai: "https://api.openai.com/v1",
  claude: "https://api.anthropic.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
  grok: "https://api.x.ai/v1",
  groq: "https://api.groq.com/openai/v1",
  openrouter: "https://openrouter.ai/api/v1",
  githubModels: "https://models.inference.ai.azure.com",
  ollama: "http://localhost:11434/v1",
  lmstudio: "http://localhost:1234/v1",
};

const llmProviderList: Record<string, string> = {
  Custom: "custom",
  "OpenAI (ChatGPT)": "openai",
  "Claude (Anthropic)": "claude",
  "Gemini (Google, free tier available)": "gemini",
  "Grok (xAI)": "grok",
  "Groq (free, fast Llama)": "groq",
  "OpenRouter (free models with :free suffix)": "openrouter",
  "GitHub Models (free with GitHub token)": "githubModels",
  "Ollama (local)": "ollama",
  "LM Studio (local)": "lmstudio",
};

export default defineEngineMeta({
  id: "localLlm",
  order: 9,
  label: "LLM",
  i18nKey: "OpenAI_compatible_LLM",
  // a generic OpenAI-compatible endpoint has no single brand
  icon: { kind: "mark", mark: "AI", color: "#7c3aed" },
  setup: "required",
  fields: [
    {
      key: "provider",
      i18nKey: "LLM_Provider",
      type: "select",
      options: llmProviderList,
      default: "custom",
    },
    {
      key: "endpoint",
      i18nKey: "LLM_Api_Endpoint",
      type: "url",
      required: true,
      placeholder: "http://localhost:11434/v1",
      readonlyWhen: (values) => Boolean(values.provider) && values.provider !== "custom",
    },
    { key: "apiKey", i18nKey: "LLM_Api_Key", type: "password", placeholder: "sk-..." },
    { key: "model", i18nKey: "LLM_Model", type: "llmModel", required: true },
  ],
});
