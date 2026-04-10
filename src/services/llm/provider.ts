import type { LLMProvider, DashboardSpec, TableSchema, ChatMessage, PatchOp } from '../../types';
import { validateSpecSQL } from './prompts';
import { executeQuery } from '../duckdb';

let currentProvider: LLMProvider | null = null;

export function setLLMProvider(provider: LLMProvider): void {
  currentProvider = provider;
}

export function getLLMProvider(): LLMProvider | null {
  return currentProvider;
}

const MAX_RETRIES = 2;

/**
 * Wraps an LLM provider with self-correction: if the LLM generates invalid
 * output, feeds the error back and asks it to fix the response.
 */
export function withSelfCorrection(provider: LLMProvider): LLMProvider {
  return {
    name: provider.name,

    async generateDashboard(
      schema: TableSchema,
      domainContext?: string,
    ): Promise<DashboardSpec> {
      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          let spec: DashboardSpec;
          if (attempt === 0) {
            spec = await provider.generateDashboard(schema, domainContext);
          } else {
            // Feed the error back so the LLM can self-correct
            const correctionHint = `${domainContext || ''}\n\n## IMPORTANT — Previous Attempt Failed\nYour previous response could not be used. Error: ${lastError!.message}\nPlease fix the issue and return valid JSON.`.trim();
            spec = await provider.generateDashboard(schema, correctionHint);
          }

          // Dry-run all SQL to catch bad column refs, syntax errors, etc.
          const sqlErrors = await validateSpecSQL(spec, (sql) => executeQuery(sql));
          if (sqlErrors.length > 0) {
            throw new Error(`SQL validation failed:\n${sqlErrors.join('\n')}`);
          }

          return spec;
        } catch (e) {
          lastError = e instanceof Error ? e : new Error(String(e));
          if (!isRetryableError(lastError)) throw lastError;
        }
      }
      throw lastError!;
    },

    async refineDashboard(
      currentSpec: DashboardSpec,
      userMessage: string,
      schema: TableSchema,
      history: ChatMessage[],
      domainContext?: string,
    ): Promise<{
      patches: PatchOp[];
      explanation: string;
      followUps: string[];
      educationalNote?: string;
    }> {
      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          if (attempt === 0) {
            return await provider.refineDashboard(currentSpec, userMessage, schema, history, domainContext);
          }
          const correctionHint = `${userMessage}\n\n[System: your previous response failed with: ${lastError!.message}. Please return valid JSON.]`;
          return await provider.refineDashboard(currentSpec, correctionHint, schema, history, domainContext);
        } catch (e) {
          lastError = e instanceof Error ? e : new Error(String(e));
          if (!isRetryableError(lastError)) throw lastError;
        }
      }
      throw lastError!;
    },
  };
}

function isRetryableError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return (
    msg.includes('invalid dashboard spec') ||
    msg.includes('invalid refinement') ||
    msg.includes('failed to parse') ||
    msg.includes('json') ||
    msg.includes('sql validation failed')
  );
}
