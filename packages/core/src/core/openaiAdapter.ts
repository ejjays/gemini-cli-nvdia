/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import OpenAI from 'openai';
import type {
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  CountTokensResponse,
  EmbedContentParameters,
  EmbedContentResponse,
  Content,
  Part,
  Candidate,
  Tool,
  FunctionCall,
} from '@google/genai';
import type { ContentGenerator } from './contentGenerator.js';
import type { LlmRole } from '../telemetry/llmRole.js';
import { debugLogger } from '../utils/debugLogger.js';

/**
 * Adapter that wraps OpenAI SDK to match Google GenAI interface
 */
export class OpenAIAdapter implements ContentGenerator {
  private client: OpenAI;

  constructor(apiKey: string, baseURL?: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: baseURL || 'https://api.openai.com/v1',
      defaultHeaders: baseURL?.includes('nvidia') ? {
        'Authorization': `Bearer ${apiKey}`
      } : undefined,
    });
  }

  private convertGoogleToOpenAI(
    contents: Content[],
    systemInstruction?: string | Content
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    
    // Add system instruction if provided
    if (systemInstruction) {
      const systemText = typeof systemInstruction === 'string' 
        ? systemInstruction 
        : (systemInstruction.parts?.[0] as { text?: string })?.text || '';
      if (systemText) {
        messages.push({ role: 'system', content: systemText });
      }
    }

    for (let i = 0; i < contents.length; i++) {
      const content = contents[i];
      const role = content.role === 'user' ? 'user' : content.role === 'model' ? 'assistant' : 'system';
      
      const parts = content.parts || [];
      // Filter out thought parts from normal content for OpenAI
      const textParts = parts.filter((p: Part) => 'text' in p && !(p as any).thought);
      const text = textParts.map((p: Part) => (p as { text: string }).text).join('\n');
      
      const functionCalls = parts.filter((p: Part) => !!p.functionCall);
      const functionResponses = parts.filter((p: Part) => !!p.functionResponse);

      if (role === 'assistant' && functionCalls.length > 0) {
        messages.push({
          role: 'assistant',
          content: text || null,
          tool_calls: functionCalls.map((p, j) => ({
            id: (p.functionCall as any).id || `call_${i}_${j}`,
            type: 'function',
            function: {
              name: p.functionCall!.name,
              arguments: JSON.stringify(p.functionCall!.args),
            },
          })),
        } as any);
      } else if (role === 'user' && functionResponses.length > 0) {
        // OpenAI requires tool responses to follow the assistant message with tool_calls
        // If there's user text in this turn, it should probably come AFTER the tool responses
        
        let lastAssistantTurnIdx = -1;
        for (let k = messages.length - 1; k >= 0; k--) {
          if (messages[k].role === 'assistant' && (messages[k] as any).tool_calls) {
            lastAssistantTurnIdx = k;
            break;
          }
        }

        for (let j = 0; j < functionResponses.length; j++) {
          const p = functionResponses[j];
          const callId = (p.functionResponse as any).id || 
            (lastAssistantTurnIdx !== -1 
              ? (messages[lastAssistantTurnIdx] as any).tool_calls[j]?.id || `call_unknown_${j}`
              : `call_turn_fallback_${j}`);

          messages.push({
            role: 'tool',
            tool_call_id: callId,
            content: typeof p.functionResponse!.response === 'string' 
              ? p.functionResponse!.response 
              : JSON.stringify(p.functionResponse!.response),
          } as any);
        }

        if (text) {
          messages.push({ role: 'user', content: text });
        }
      } else {
        messages.push({ role, content: text || '' } as OpenAI.Chat.ChatCompletionMessageParam);
      }
    }
    
    return messages;
  }

  private convertTools(googleTools: Tool[] | undefined): OpenAI.Chat.ChatCompletionTool[] | undefined {
    if (!googleTools || googleTools.length === 0) return undefined;

    const openaiTools: OpenAI.Chat.ChatCompletionTool[] = [];
    for (const tool of googleTools) {
      if (tool.functionDeclarations) {
        for (const fd of tool.functionDeclarations) {
          openaiTools.push({
            type: 'function',
            function: {
              name: fd.name as string,
              description: fd.description,
              parameters: fd.parameters as any,
            },
          });
        }
      }
    }
    return openaiTools.length > 0 ? openaiTools : undefined;
  }

  private convertOpenAIToGoogle(
    response: OpenAI.Chat.ChatCompletion,
    thinkingConfig?: { thinkingBudget?: number; includeThoughts?: boolean },
  ): GenerateContentResponse {
    const choice = response.choices[0];
    const text = choice?.message?.content || '';
    const reasoning = (choice?.message as any)?.reasoning_content || '';
    const parts: Part[] = [];
    const functionCalls: FunctionCall[] = [];
    
    const isThinkingEnabled = thinkingConfig?.includeThoughts ||
      (typeof thinkingConfig?.thinkingBudget === 'number' && thinkingConfig.thinkingBudget > 0);

    if (reasoning && isThinkingEnabled) {
      parts.push({ text: reasoning, thought: true } as any);
    }
    if (text) {
      parts.push({ text });
    }

    if (choice?.message?.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        try {
          const tcFunc = (tc as any).function;
          const args = tcFunc.arguments ? JSON.parse(tcFunc.arguments) : {};
          const fnCall: FunctionCall = {
            name: tcFunc.name,
            args,
          };
          (fnCall as any).id = tc.id;
          functionCalls.push(fnCall);
          parts.push({ functionCall: fnCall });
        } catch (e) {
          debugLogger.error('[OpenAIAdapter] Failed to parse tool call arguments:', (tc as any).function?.arguments);
        }
      }
    }
    
    const candidate: Candidate = {
      content: {
        role: 'model',
        parts,
      },
      finishReason: (choice?.finish_reason === 'stop' ? 'STOP' : 
                    choice?.finish_reason === 'tool_calls' ? 'STOP' : 'OTHER') as any,
      index: 0,
    };

    return {
      candidates: [candidate],
      functionCalls: functionCalls.length > 0 ? functionCalls : undefined,
      usageMetadata: {
        promptTokenCount: response.usage?.prompt_tokens || 0,
        candidatesTokenCount: response.usage?.completion_tokens || 0,
        totalTokenCount: response.usage?.total_tokens || 0,
      },
      text,
    } as any as GenerateContentResponse;
  }

  async generateContent(
    request: GenerateContentParameters,
    _userPromptId: string,
    _role: LlmRole,
  ): Promise<GenerateContentResponse> {
    const messages = this.convertGoogleToOpenAI(
      Array.isArray(request.contents) ? request.contents : [request.contents as any],
      request.config?.systemInstruction as any
    );
    const tools = this.convertTools((request as any).tools || request.config?.tools);
    
    debugLogger.debug('[OpenAIAdapter] generateContent request:', { model: request.model, messageCount: messages.length, hasTools: !!tools });

    const thinkingConfig = request.config?.thinkingConfig as
      | { thinkingBudget?: number; thinkingLevel?: string; includeThoughts?: boolean }
      | undefined;
    const reasoningEffort =
      thinkingConfig?.thinkingBudget && thinkingConfig.thinkingBudget > 0
        ? 'high'
        : thinkingConfig?.includeThoughts
          ? 'high'
          : undefined;

    const response = await this.client.chat.completions.create({
      model: request.model,
      messages,
      tools,
      temperature: request.config?.temperature,
      max_tokens: request.config?.maxOutputTokens,
      top_p: request.config?.topP,
      ...(reasoningEffort ? { reasoning_effort: reasoningEffort as 'high' | 'medium' | 'low' } : {}),
    });

    return this.convertOpenAIToGoogle(response, request.config?.thinkingConfig as any);
  }

  async generateContentStream(
    request: GenerateContentParameters,
    _userPromptId: string,
    _role: LlmRole,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const self = this;
    async function* generator() {
      const messages = self.convertGoogleToOpenAI(
        Array.isArray(request.contents) ? request.contents : [request.contents as any],
        request.config?.systemInstruction as any
      );
      const tools = self.convertTools((request as any).tools || request.config?.tools);

      debugLogger.debug('[OpenAIAdapter] generateContentStream request:', { model: request.model, messageCount: messages.length, hasTools: !!tools });

      const tc = request.config?.thinkingConfig as
        | { thinkingBudget?: number; thinkingLevel?: string; includeThoughts?: boolean }
        | undefined;
      const reasoningEffort =
        tc?.thinkingBudget && tc.thinkingBudget > 0
          ? 'high'
          : tc?.includeThoughts
            ? 'high'
            : undefined;

      const stream = await self.client.chat.completions.create({
        model: request.model,
        messages,
        tools,
        temperature: request.config?.temperature,
        max_tokens: request.config?.maxOutputTokens,
        top_p: request.config?.topP,
        ...(reasoningEffort ? { reasoning_effort: reasoningEffort as 'high' | 'medium' | 'low' } : {}),
        stream: true,
      });

      let toolCallsBuffer: any[] = [];

      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        if (!choice) continue;

        const delta = choice.delta;
        const text = delta?.content || '';
        const reasoning = (delta as any)?.reasoning_content || '';
        const finishReason = choice.finish_reason;
        
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (!toolCallsBuffer[tc.index]) {
              toolCallsBuffer[tc.index] = {
                id: tc.id,
                function: { name: '', arguments: '' }
              };
            }
            if (tc.id) toolCallsBuffer[tc.index].id = tc.id;
            if (tc.function?.name) toolCallsBuffer[tc.index].function.name += tc.function.name;
            if (tc.function?.arguments) toolCallsBuffer[tc.index].function.arguments += tc.function.arguments;
          }
        }

        const hasContent = text.length > 0 || reasoning.length > 0;
        const isFinished = !!finishReason;
        
        if (!hasContent && !isFinished && !delta?.tool_calls) continue;
        
        const parts: Part[] = [];
        if (reasoning) {
          parts.push({ text: reasoning, thought: true } as any);
        }
        if (text) {
          parts.push({ text });
        }
        
        let functionCalls: FunctionCall[] | undefined = undefined;

        if (isFinished && toolCallsBuffer.length > 0) {
          functionCalls = [];
          for (const tc of toolCallsBuffer) {
            if (tc && tc.function.name) {
              try {
                const fnCall: FunctionCall = {
                  name: tc.function.name,
                  args: JSON.parse(tc.function.arguments.trim() || '{}'),
                };
                (fnCall as any).id = tc.id;
                functionCalls.push(fnCall);
                parts.push({ functionCall: fnCall });
                debugLogger.debug('[OpenAIAdapter] Assembled function call:', tc.function.name);
              } catch (e) {
                debugLogger.error('[OpenAIAdapter] Failed to parse tool call arguments:', tc.function.arguments);
              }
            }
          }
          toolCallsBuffer = []; 
        }

        // If we have nothing to yield and not finished, wait for more chunks
        if (parts.length === 0 && !isFinished && !functionCalls) continue;

        yield {
          candidates: [{
            content: {
              role: 'model',
              parts,
            },
            ...(isFinished ? { finishReason: (finishReason === 'stop' ? 'STOP' : 
                                 finishReason === 'tool_calls' ? 'STOP' : 'OTHER') as any } : {}),
            index: 0,
          }],
          functionCalls,
          text: parts.filter(p => 'text' in p).map(p => (p as any).text).join(''),
        } as any as GenerateContentResponse;
      }
    }
    return generator();
  }

  async countTokens(_request: CountTokensParameters): Promise<CountTokensResponse> {
    return {
      totalTokens: 0,
    };
  }

  async embedContent(_request: EmbedContentParameters): Promise<EmbedContentResponse> {
    throw new Error('Embeddings not supported with NVIDIA API adapter');
  }
}
