import { useRecoilState } from 'recoil';
import { Switch } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { useGetStartupConfig } from '~/data-provider';
import store from '~/store';

export default function TextToSpeechSwitch({
  onCheckedChange,
}: {
  onCheckedChange?: (value: boolean) => void;
}) {
  const localize = useLocalize();
  const { data: startupConfig } = useGetStartupConfig();
  const [TextToSpeech, setTextToSpeech] = useRecoilState<boolean>(store.textToSpeech);

  // 🆕 RESPETA CONFIGURACIÓN DEL SERVIDOR
  const textToSpeechEnabled = startupConfig?.interface?.textToSpeech !== false;

  const handleCheckedChange = (value: boolean) => {
    setTextToSpeech(value);
    if (onCheckedChange) {
      onCheckedChange(value);
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div>
        <strong>{localize('com_nav_text_to_speech')}</strong>
      </div>
      <Switch
        id="TextToSpeech"
        checked={TextToSpeech}
        onCheckedChange={handleCheckedChange}
        className="ml-4"
        data-testid="TextToSpeech"
        disabled={!textToSpeechEnabled}
      />
    </div>
  );
}
