import { EModelEndpoint, isAssistantsEndpoint } from 'librechat-data-provider';
import { useGetStartupConfig } from '~/data-provider';

type TUseGenerations = {
  error?: boolean;
  endpoint?: string;
  messageId?: string;
  isEditing?: boolean;
  isSubmitting: boolean;
  searchResult?: boolean;
  finish_reason?: string;
  latestMessageId?: string;
  isCreatedByUser?: boolean;
};

export default function useGenerationsByLatest({
  error = false,
  endpoint,
  messageId,
  isEditing = false,
  isSubmitting,
  searchResult = false,
  finish_reason = '',
  latestMessageId,
  isCreatedByUser = false,
}: TUseGenerations) {
  const { data: startupConfig } = useGetStartupConfig();
  
  const isEditableEndpoint = Boolean(
    [
      EModelEndpoint.openAI,
      EModelEndpoint.custom,
      EModelEndpoint.google,
      EModelEndpoint.agents,
      EModelEndpoint.bedrock,
      EModelEndpoint.anthropic,
      EModelEndpoint.gptPlugins,
      EModelEndpoint.azureOpenAI,
    ].find((e) => e === endpoint),
  );

  const continueSupported =
    latestMessageId === messageId &&
    finish_reason &&
    finish_reason !== 'stop' &&
    !isEditing &&
    !searchResult &&
    isEditableEndpoint;

  const branchingSupported = Boolean(
    [
      EModelEndpoint.azureOpenAI,
      EModelEndpoint.openAI,
      EModelEndpoint.custom,
      EModelEndpoint.agents,
      EModelEndpoint.bedrock,
      EModelEndpoint.chatGPTBrowser,
      EModelEndpoint.google,
      EModelEndpoint.gptPlugins,
      EModelEndpoint.anthropic,
    ].find((e) => e === endpoint),
  );

  const regenerateEnabled =
    !isCreatedByUser && !searchResult && !isEditing && !isSubmitting && branchingSupported;

  // 🔍 DEBUG: Log para diagnosticar edición de mensajes
  console.log('[useGenerationsByLatest] Edit button logic:', {
    messageId,
    isCreatedByUser,
    isEditableEndpoint,
    branchingSupported,
    configEditAgentMessages: startupConfig?.interface?.editAgentMessages,
    isSubmitting,
    error,
    searchResult
  });

  const hideEditButton =
    isSubmitting ||
    error ||
    searchResult ||
    !branchingSupported ||
    !isEditableEndpoint ||
    // 🆕 LÓGICA CORREGIDA: Si editAgentMessages está deshabilitado, ocultar botón para mensajes del agente
    (!isCreatedByUser && startupConfig?.interface?.editAgentMessages === false);

  console.log('[useGenerationsByLatest] hideEditButton result:', {
    hideEditButton,
    reason: hideEditButton ? 'hidden' : 'visible',
    isAgentMessage: !isCreatedByUser,
    editAgentMessagesDisabled: startupConfig?.interface?.editAgentMessages === false
  });

  const forkingSupported = !isAssistantsEndpoint(endpoint) && !searchResult;

  return {
    forkingSupported,
    continueSupported,
    regenerateEnabled,
    isEditableEndpoint,
    hideEditButton,
  };
}
