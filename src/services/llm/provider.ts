import type { LLMProvider } from '../../types';

let currentProvider: LLMProvider | null = null;

export function setLLMProvider(provider: LLMProvider): void {
  currentProvider = provider;
}

export function getLLMProvider(): LLMProvider | null {
  return currentProvider;
}
