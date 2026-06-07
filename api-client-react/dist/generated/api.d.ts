import type { QueryKey, UseMutationOptions, UseMutationResult, UseQueryOptions, UseQueryResult } from '@tanstack/react-query';
import type { EmmaDeeplinkInput, EmmaDeeplinkOutput, EmmaSearchInput, EmmaSearchOutput, EmmaSpeakInput, EmmaSpeakOutput, EmmaTranscribeInput, EmmaTranscribeOutput, HealthStatus, OpenaiConversation, OpenaiConversationInput, OpenaiConversationWithMessages, OpenaiError, OpenaiMessage, OpenaiMessageInput } from './api.schemas';
import { customFetch } from '../custom-fetch';
import type { ErrorType, BodyType } from '../custom-fetch';
type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];
export declare const getHealthCheckUrl: () => string;
/**
 * Returns server health status
 * @summary Health check
 */
export declare const healthCheck: (options?: RequestInit) => Promise<HealthStatus>;
export declare const getHealthCheckQueryKey: () => readonly ["/api/healthz"];
export declare const getHealthCheckQueryOptions: <TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData> & {
    queryKey: QueryKey;
};
export type HealthCheckQueryResult = NonNullable<Awaited<ReturnType<typeof healthCheck>>>;
export type HealthCheckQueryError = ErrorType<unknown>;
/**
 * @summary Health check
 */
export declare function useHealthCheck<TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getListOpenaiConversationsUrl: () => string;
/**
 * @summary List all conversations
 */
export declare const listOpenaiConversations: (options?: RequestInit) => Promise<OpenaiConversation[]>;
export declare const getListOpenaiConversationsQueryKey: () => readonly ["/api/openai/conversations"];
export declare const getListOpenaiConversationsQueryOptions: <TData = Awaited<ReturnType<typeof listOpenaiConversations>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listOpenaiConversations>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listOpenaiConversations>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListOpenaiConversationsQueryResult = NonNullable<Awaited<ReturnType<typeof listOpenaiConversations>>>;
export type ListOpenaiConversationsQueryError = ErrorType<unknown>;
/**
 * @summary List all conversations
 */
export declare function useListOpenaiConversations<TData = Awaited<ReturnType<typeof listOpenaiConversations>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listOpenaiConversations>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getCreateOpenaiConversationUrl: () => string;
/**
 * @summary Create a new conversation
 */
export declare const createOpenaiConversation: (openaiConversationInput: OpenaiConversationInput, options?: RequestInit) => Promise<OpenaiConversation>;
export declare const getCreateOpenaiConversationMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createOpenaiConversation>>, TError, {
        data: BodyType<OpenaiConversationInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createOpenaiConversation>>, TError, {
    data: BodyType<OpenaiConversationInput>;
}, TContext>;
export type CreateOpenaiConversationMutationResult = NonNullable<Awaited<ReturnType<typeof createOpenaiConversation>>>;
export type CreateOpenaiConversationMutationBody = BodyType<OpenaiConversationInput>;
export type CreateOpenaiConversationMutationError = ErrorType<unknown>;
/**
* @summary Create a new conversation
*/
export declare const useCreateOpenaiConversation: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createOpenaiConversation>>, TError, {
        data: BodyType<OpenaiConversationInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createOpenaiConversation>>, TError, {
    data: BodyType<OpenaiConversationInput>;
}, TContext>;
export declare const getGetOpenaiConversationUrl: (id: number) => string;
/**
 * @summary Get conversation with messages
 */
export declare const getOpenaiConversation: (id: number, options?: RequestInit) => Promise<OpenaiConversationWithMessages>;
export declare const getGetOpenaiConversationQueryKey: (id: number) => readonly [`/api/openai/conversations/${number}`];
export declare const getGetOpenaiConversationQueryOptions: <TData = Awaited<ReturnType<typeof getOpenaiConversation>>, TError = ErrorType<OpenaiError>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getOpenaiConversation>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getOpenaiConversation>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetOpenaiConversationQueryResult = NonNullable<Awaited<ReturnType<typeof getOpenaiConversation>>>;
export type GetOpenaiConversationQueryError = ErrorType<OpenaiError>;
/**
 * @summary Get conversation with messages
 */
export declare function useGetOpenaiConversation<TData = Awaited<ReturnType<typeof getOpenaiConversation>>, TError = ErrorType<OpenaiError>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getOpenaiConversation>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getDeleteOpenaiConversationUrl: (id: number) => string;
/**
 * @summary Delete a conversation
 */
export declare const deleteOpenaiConversation: (id: number, options?: RequestInit) => Promise<void>;
export declare const getDeleteOpenaiConversationMutationOptions: <TError = ErrorType<OpenaiError>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteOpenaiConversation>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteOpenaiConversation>>, TError, {
    id: number;
}, TContext>;
export type DeleteOpenaiConversationMutationResult = NonNullable<Awaited<ReturnType<typeof deleteOpenaiConversation>>>;
export type DeleteOpenaiConversationMutationError = ErrorType<OpenaiError>;
/**
* @summary Delete a conversation
*/
export declare const useDeleteOpenaiConversation: <TError = ErrorType<OpenaiError>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteOpenaiConversation>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteOpenaiConversation>>, TError, {
    id: number;
}, TContext>;
export declare const getListOpenaiMessagesUrl: (id: number) => string;
/**
 * @summary List messages in a conversation
 */
export declare const listOpenaiMessages: (id: number, options?: RequestInit) => Promise<OpenaiMessage[]>;
export declare const getListOpenaiMessagesQueryKey: (id: number) => readonly [`/api/openai/conversations/${number}/messages`];
export declare const getListOpenaiMessagesQueryOptions: <TData = Awaited<ReturnType<typeof listOpenaiMessages>>, TError = ErrorType<unknown>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listOpenaiMessages>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listOpenaiMessages>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListOpenaiMessagesQueryResult = NonNullable<Awaited<ReturnType<typeof listOpenaiMessages>>>;
export type ListOpenaiMessagesQueryError = ErrorType<unknown>;
/**
 * @summary List messages in a conversation
 */
export declare function useListOpenaiMessages<TData = Awaited<ReturnType<typeof listOpenaiMessages>>, TError = ErrorType<unknown>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listOpenaiMessages>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getSendOpenaiMessageUrl: (id: number) => string;
/**
 * @summary Send a text message and receive a streaming text/SSE response
 */
export declare const sendOpenaiMessage: (id: number, openaiMessageInput: OpenaiMessageInput, options?: RequestInit) => Promise<unknown>;
export declare const getSendOpenaiMessageMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof sendOpenaiMessage>>, TError, {
        id: number;
        data: BodyType<OpenaiMessageInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof sendOpenaiMessage>>, TError, {
    id: number;
    data: BodyType<OpenaiMessageInput>;
}, TContext>;
export type SendOpenaiMessageMutationResult = NonNullable<Awaited<ReturnType<typeof sendOpenaiMessage>>>;
export type SendOpenaiMessageMutationBody = BodyType<OpenaiMessageInput>;
export type SendOpenaiMessageMutationError = ErrorType<unknown>;
/**
* @summary Send a text message and receive a streaming text/SSE response
*/
export declare const useSendOpenaiMessage: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof sendOpenaiMessage>>, TError, {
        id: number;
        data: BodyType<OpenaiMessageInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof sendOpenaiMessage>>, TError, {
    id: number;
    data: BodyType<OpenaiMessageInput>;
}, TContext>;
export declare const getEmmaTranscribeUrl: () => string;
/**
 * @summary Transcribe audio to text using Whisper
 */
export declare const emmaTranscribe: (emmaTranscribeInput: EmmaTranscribeInput, options?: RequestInit) => Promise<EmmaTranscribeOutput>;
export declare const getEmmaTranscribeMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof emmaTranscribe>>, TError, {
        data: BodyType<EmmaTranscribeInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof emmaTranscribe>>, TError, {
    data: BodyType<EmmaTranscribeInput>;
}, TContext>;
export type EmmaTranscribeMutationResult = NonNullable<Awaited<ReturnType<typeof emmaTranscribe>>>;
export type EmmaTranscribeMutationBody = BodyType<EmmaTranscribeInput>;
export type EmmaTranscribeMutationError = ErrorType<unknown>;
/**
* @summary Transcribe audio to text using Whisper
*/
export declare const useEmmaTranscribe: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof emmaTranscribe>>, TError, {
        data: BodyType<EmmaTranscribeInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof emmaTranscribe>>, TError, {
    data: BodyType<EmmaTranscribeInput>;
}, TContext>;
export declare const getEmmaSpeakUrl: () => string;
/**
 * @summary Convert text to speech using OpenAI TTS
 */
export declare const emmaSpeak: (emmaSpeakInput: EmmaSpeakInput, options?: RequestInit) => Promise<EmmaSpeakOutput>;
export declare const getEmmaSpeakMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof emmaSpeak>>, TError, {
        data: BodyType<EmmaSpeakInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof emmaSpeak>>, TError, {
    data: BodyType<EmmaSpeakInput>;
}, TContext>;
export type EmmaSpeakMutationResult = NonNullable<Awaited<ReturnType<typeof emmaSpeak>>>;
export type EmmaSpeakMutationBody = BodyType<EmmaSpeakInput>;
export type EmmaSpeakMutationError = ErrorType<unknown>;
/**
* @summary Convert text to speech using OpenAI TTS
*/
export declare const useEmmaSpeak: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof emmaSpeak>>, TError, {
        data: BodyType<EmmaSpeakInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof emmaSpeak>>, TError, {
    data: BodyType<EmmaSpeakInput>;
}, TContext>;
export declare const getEmmaSearchUrl: () => string;
/**
 * @summary Web search with page content extraction
 */
export declare const emmaSearch: (emmaSearchInput: EmmaSearchInput, options?: RequestInit) => Promise<EmmaSearchOutput>;
export declare const getEmmaSearchMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof emmaSearch>>, TError, {
        data: BodyType<EmmaSearchInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof emmaSearch>>, TError, {
    data: BodyType<EmmaSearchInput>;
}, TContext>;
export type EmmaSearchMutationResult = NonNullable<Awaited<ReturnType<typeof emmaSearch>>>;
export type EmmaSearchMutationBody = BodyType<EmmaSearchInput>;
export type EmmaSearchMutationError = ErrorType<unknown>;
/**
* @summary Web search with page content extraction
*/
export declare const useEmmaSearch: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof emmaSearch>>, TError, {
        data: BodyType<EmmaSearchInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof emmaSearch>>, TError, {
    data: BodyType<EmmaSearchInput>;
}, TContext>;
export declare const getEmmaDeeplinkUrl: () => string;
/**
 * @summary Parse app intent and return deep link URL
 */
export declare const emmaDeeplink: (emmaDeeplinkInput: EmmaDeeplinkInput, options?: RequestInit) => Promise<EmmaDeeplinkOutput>;
export declare const getEmmaDeeplinkMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof emmaDeeplink>>, TError, {
        data: BodyType<EmmaDeeplinkInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof emmaDeeplink>>, TError, {
    data: BodyType<EmmaDeeplinkInput>;
}, TContext>;
export type EmmaDeeplinkMutationResult = NonNullable<Awaited<ReturnType<typeof emmaDeeplink>>>;
export type EmmaDeeplinkMutationBody = BodyType<EmmaDeeplinkInput>;
export type EmmaDeeplinkMutationError = ErrorType<void>;
/**
* @summary Parse app intent and return deep link URL
*/
export declare const useEmmaDeeplink: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof emmaDeeplink>>, TError, {
        data: BodyType<EmmaDeeplinkInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof emmaDeeplink>>, TError, {
    data: BodyType<EmmaDeeplinkInput>;
}, TContext>;
export {};
//# sourceMappingURL=api.d.ts.map