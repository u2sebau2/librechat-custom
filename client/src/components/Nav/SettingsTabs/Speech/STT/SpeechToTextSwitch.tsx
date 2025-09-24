import { useRecoilState } from 'recoil';
import { Switch } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { useGetStartupConfig } from '~/data-provider';
import store from '~/store';

export default function SpeechToTextSwitch({
  onCheckedChange,
}: {
  onCheckedChange?: (value: boolean) => void;
}) {
  const localize = useLocalize();
  const { data: startupConfig } = useGetStartupConfig();
  const [speechToText, setSpeechToText] = useRecoilState<boolean>(store.speechToText);

  // 🆕 RESPETA CONFIGURACIÓN DEL SERVIDOR
  const speechToTextEnabled = startupConfig?.interface?.speechToText !== false;

  const handleCheckedChange = (value: boolean) => {
    setSpeechToText(value);
    if (onCheckedChange) {
      onCheckedChange(value);
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div>
        <strong>{localize('com_nav_speech_to_text')}</strong>
      </div>
      <Switch
        id="SpeechToText"
        checked={speechToText}
        onCheckedChange={handleCheckedChange}
        className="ml-4"
        data-testid="SpeechToText"
        disabled={!speechToTextEnabled}
      />
    </div>
  );
}
