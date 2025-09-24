import { useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { EModelEndpoint, isAgentsEndpoint, isAssistantsEndpoint, getConfigDefaults } from 'librechat-data-provider';
import type {
  TPreset,
  TModelSpec,
  TConversation,
  TAssistantsMap,
  TEndpointsConfig,
} from 'librechat-data-provider';
import type { MentionOption, ConvoGenerator } from '~/common';
import { getConvoSwitchLogic, getModelSpecIconURL, removeUnavailableTools, logger } from '~/utils';
import { useChatContext } from '~/Providers';
import { useDefaultConvo } from '~/hooks';
import { useGetStartupConfig } from '~/data-provider';
import store from '~/store';

export default function useSelectMention({
  presets,
  modelSpecs,
  assistantsMap,
  endpointsConfig,
  newConversation,
  returnHandlers,
  forceNewChat = false,
}: {
  presets?: TPreset[];
  modelSpecs: TModelSpec[];
  assistantsMap?: TAssistantsMap;
  newConversation: ConvoGenerator;
  endpointsConfig: TEndpointsConfig;
  returnHandlers?: boolean;
  forceNewChat?: boolean; // 🆕 Nuevo parámetro para controlar comportamiento
}) {
  const { conversation } = useChatContext();
  const getDefaultConversation = useDefaultConvo();
  const { data: startupConfig } = useGetStartupConfig();
  const modularChatLocal = useRecoilValue(store.modularChat);
  const availableTools = useRecoilValue(store.availableTools);

  // 🆕 RESPETA LA CONFIGURACIÓN DEL SERVIDOR: Si el servidor deshabilita modularChat, ignorar localStorage
  const modularChat = startupConfig?.interface?.modularChat !== false ? modularChatLocal : false;

  const onSelectSpec = useCallback(
    (spec?: TModelSpec) => {
      if (!spec) {
        return;
      }
      const { preset } = spec;
      preset.iconURL = getModelSpecIconURL(spec);
      preset.spec = spec.name;
      const { endpoint } = preset;
      const newEndpoint = endpoint ?? '';
      if (!newEndpoint) {
        return;
      }

      const {
        template,
        shouldSwitch,
        isNewModular,
        newEndpointType,
        isCurrentModular,
        isExistingConversation,
      } = getConvoSwitchLogic({
        newEndpoint,
        modularChat,
        conversation,
        endpointsConfig,
      });

      if (newEndpointType) {
        preset.endpointType = newEndpointType;
      }

      if (
        isAssistantsEndpoint(newEndpoint) &&
        preset.assistant_id != null &&
        !(preset.model ?? '')
      ) {
        preset.model = assistantsMap?.[newEndpoint]?.[preset.assistant_id]?.model;
      }

      // 🔀 COMPORTAMIENTO CONDICIONAL: Selector vs Menciones @
      if (forceNewChat) {
        // Para SELECTOR de arriba: Siempre crear nuevo chat
        logger.info('conversation', 'Creating new chat for selected spec/model (selector)', { 
          currentConversation: conversation?.conversationId,
          newEndpoint,
          preset 
        });
        
        newConversation({
          template: { ...(template as Partial<TConversation>) },
          preset,
          keepAddedConvos: false,
        });
      } else {
        // Para MENCIONES @: Lógica original con validaciones
        const isModular = isCurrentModular && isNewModular && shouldSwitch;
        if (isExistingConversation && isModular) {
          template.endpointType = newEndpointType as EModelEndpoint | undefined;

          const currentConvo = getDefaultConversation({
            conversation: { ...(conversation ?? {}), endpointType: template.endpointType },
            preset: template,
            cleanOutput: true,
          });

          logger.info('conversation', 'Switching conversation to new spec (modular mention)', conversation);
          newConversation({
            template: currentConvo,
            preset,
            keepLatestMessage: true,
            keepAddedConvos: true,
          });
          return;
        }

        logger.info('conversation', 'Switching conversation to new spec (mention)', conversation);
        newConversation({
          template: { ...(template as Partial<TConversation>) },
          preset,
          keepAddedConvos: isModular,
        });
      }
    },
    [
      conversation,
      getDefaultConversation,
      modularChat,
      newConversation,
      endpointsConfig,
      assistantsMap,
      forceNewChat,
    ],
  );

  type Kwargs = {
    model?: string;
    agent_id?: string;
    assistant_id?: string;
    spec?: string | null;
  };

  const onSelectEndpoint = useCallback(
    (_newEndpoint?: EModelEndpoint | string | null, kwargs: Kwargs = {}) => {
      const newEndpoint = _newEndpoint ?? '';
      if (!newEndpoint) {
        return;
      }

      const {
        shouldSwitch,
        isNewModular,
        isCurrentModular,
        isExistingConversation,
        newEndpointType,
        template,
      } = getConvoSwitchLogic({
        newEndpoint,
        modularChat,
        conversation,
        endpointsConfig,
      });

      const model = kwargs.model ?? '';
      if (model) {
        template.model = model;
      }

      const assistant_id = kwargs.assistant_id ?? '';
      if (assistant_id) {
        template.assistant_id = assistant_id;
      }
      const agent_id = kwargs.agent_id ?? '';
      if (agent_id) {
        template.agent_id = agent_id;
      }

      template.spec = null;
      template.iconURL = null;
      template.modelLabel = null;
      
      // 🔀 COMPORTAMIENTO CONDICIONAL: Selector vs Menciones @
      if (forceNewChat) {
        // Para SELECTOR de arriba: Siempre crear nuevo chat
        logger.info('conversation', 'Creating new chat for selected endpoint/model (selector)', {
          currentConversation: conversation?.conversationId,
          newEndpoint,
          model: kwargs.model,
          agent_id: kwargs.agent_id,
          assistant_id: kwargs.assistant_id
        });
        
        newConversation({
          template: { ...(template as Partial<TConversation>) },
          preset: { ...kwargs, spec: null, iconURL: null, modelLabel: null, endpoint: newEndpoint },
          keepAddedConvos: false,
        });
      } else {
        // Para MENCIONES @: Lógica original con validaciones
        if (isExistingConversation && isCurrentModular && isNewModular && shouldSwitch) {
          template.endpointType = newEndpointType;

          const currentConvo = getDefaultConversation({
            conversation: {
              ...(conversation ?? {}),
              spec: null,
              iconURL: null,
              modelLabel: null,
              endpointType: template.endpointType,
            },
            preset: template,
          });

          logger.info('conversation', 'Switching conversation to new endpoint/model (modular mention)', currentConvo);
          newConversation({
            template: currentConvo,
            preset: currentConvo,
            keepLatestMessage: true,
            keepAddedConvos: true,
          });
          return;
        }

        logger.info('conversation', 'Switching conversation to new endpoint/model (mention)', template);
        newConversation({
          template: { ...(template as Partial<TConversation>) },
          preset: { ...kwargs, spec: null, iconURL: null, modelLabel: null, endpoint: newEndpoint },
          keepAddedConvos: isNewModular,
        });
      }
    },
    [conversation, getDefaultConversation, modularChat, newConversation, endpointsConfig, forceNewChat],
  );

  const onSelectPreset = useCallback(
    (_newPreset?: TPreset) => {
      if (!_newPreset) {
        return;
      }

      const newPreset = removeUnavailableTools(_newPreset, availableTools);
      const newEndpoint = newPreset.endpoint ?? '';

      const {
        template,
        shouldSwitch,
        isNewModular,
        newEndpointType,
        isCurrentModular,
        isExistingConversation,
      } = getConvoSwitchLogic({
        newEndpoint,
        modularChat,
        conversation,
        endpointsConfig,
      });

      newPreset.spec = null;
      newPreset.iconURL = newPreset.iconURL ?? null;
      newPreset.modelLabel = newPreset.modelLabel ?? null;
      const disableParams = newPreset.defaultPreset === true;

      // 🔀 COMPORTAMIENTO CONDICIONAL: Selector vs Menciones @
      if (forceNewChat) {
        // Para SELECTOR de arriba: Siempre crear nuevo chat
        logger.info('conversation', 'Creating new chat for selected preset (selector)', {
          currentConversation: conversation?.conversationId,
          newEndpoint,
          preset: newPreset
        });
        
        newConversation({
          preset: newPreset,
          keepAddedConvos: false,
          disableParams,
        });
      } else {
        // Para MENCIONES @: Lógica original con validaciones
        const isModular = isCurrentModular && isNewModular && shouldSwitch;
        if (isExistingConversation && isModular) {
          template.endpointType = newEndpointType as EModelEndpoint | undefined;
          template.spec = null;
          template.iconURL = null;
          template.modelLabel = null;
          const currentConvo = getDefaultConversation({
            conversation: { ...(conversation ?? {}), endpointType: template.endpointType },
            preset: template,
            cleanInput: true,
          });

          logger.info('conversation', 'Switching conversation to new preset (modular mention)', currentConvo);
          newConversation({
            template: currentConvo,
            preset: newPreset,
            keepLatestMessage: true,
            keepAddedConvos: true,
            disableParams,
          });
          return;
        }

        logger.info('conversation', 'Switching conversation to new preset (mention)', template);
        newConversation({
          preset: newPreset,
          keepAddedConvos: isModular,
          disableParams,
        });
      }
    },
    [
      modularChat,
      conversation,
      availableTools,
      newConversation,
      endpointsConfig,
      getDefaultConversation,
      forceNewChat,
    ],
  );

  const onSelectMention = useCallback(
    (option: MentionOption) => {
      const key = option.value;
      if (option.type === 'preset') {
        const preset = presets?.find((p) => p.presetId === key);
        onSelectPreset(preset);
      } else if (option.type === 'modelSpec') {
        const modelSpec = modelSpecs.find((spec) => spec.name === key);
        onSelectSpec(modelSpec);
      } else if (option.type === 'model') {
        onSelectEndpoint(key, { model: option.label });
      } else if (option.type === 'endpoint') {
        onSelectEndpoint(key);
      } else if (isAssistantsEndpoint(option.type)) {
        onSelectEndpoint(option.type, {
          assistant_id: key,
          model: assistantsMap?.[option.type]?.[key]?.model ?? '',
        });
      } else if (isAgentsEndpoint(option.type)) {
        onSelectEndpoint(option.type, {
          agent_id: key,
        });
      }
    },
    [modelSpecs, onSelectEndpoint, onSelectPreset, onSelectSpec, presets, assistantsMap],
  );

  if (returnHandlers) {
    return {
      onSelectSpec,
      onSelectEndpoint,
    };
  }

  return {
    onSelectMention,
  };
}
