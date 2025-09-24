import React, { useContext, useCallback } from 'react';
import Cookies from 'js-cookie';
import { useRecoilState } from 'recoil';
import { Dropdown, ThemeContext } from '@librechat/client';
import ArchivedChats from './ArchivedChats';
import ToggleSwitch from '../ToggleSwitch';
import { useLocalize } from '~/hooks';
import store from '~/store';

const toggleSwitchConfigs = [
  {
    stateAtom: store.enableUserMsgMarkdown,
    localizationKey: 'com_nav_user_msg_markdown',
    switchId: 'enableUserMsgMarkdown',
    hoverCardText: undefined,
    key: 'enableUserMsgMarkdown',
  },
  {
    stateAtom: store.autoScroll,
    localizationKey: 'com_nav_auto_scroll',
    switchId: 'autoScroll',
    hoverCardText: undefined,
    key: 'autoScroll',
  },
  {
    stateAtom: store.hideSidePanel,
    localizationKey: 'com_nav_hide_panel',
    switchId: 'hideSidePanel',
    hoverCardText: undefined,
    key: 'hideSidePanel',
  },
];

export const ThemeSelector = ({
  theme,
  onChange,
}: {
  theme: string;
  onChange: (value: string) => void;
}) => {
  const localize = useLocalize();

  const themeOptions = [
    { value: 'system', label: localize('com_nav_theme_system') },
    { value: 'dark', label: localize('com_nav_theme_dark') },
    { value: 'light', label: localize('com_nav_theme_light') },
  ];

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_theme')}</div>

      <Dropdown
        value={theme}
        onChange={onChange}
        options={themeOptions}
        sizeClasses="w-[180px]"
        testId="theme-selector"
        className="z-50"
      />
    </div>
  );
};

export const LangSelector = ({
  langcode,
  onChange,
}: {
  langcode: string;
  onChange: (value: string) => void;
}) => {
  const localize = useLocalize();

  // 🆕 SOLO ESPAÑOL DISPONIBLE - Sin selector visible
  const languageOptions = [
    { value: 'es-ES', label: localize('com_nav_lang_spanish') },
  ];

  // 🆕 Mostrar idioma fijo sin dropdown
  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_language')}</div>
      <div className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-text-primary">
        🇪🇸 {localize('com_nav_lang_spanish')}
      </div>
    </div>
  );
};

function General() {
  const { theme, setTheme } = useContext(ThemeContext);

  const [langcode, setLangcode] = useRecoilState(store.lang);

  const changeTheme = useCallback(
    (value: string) => {
      setTheme(value);
    },
    [setTheme],
  );

  const changeLang = useCallback(
    (value: string) => {
      let userLang = value;
      if (value === 'auto') {
        userLang = navigator.language || navigator.languages[0];
      }

      requestAnimationFrame(() => {
        document.documentElement.lang = userLang;
      });
      setLangcode(userLang);
      Cookies.set('lang', userLang, { expires: 365 });
    },
    [setLangcode],
  );

  return (
    <div className="flex flex-col gap-3 p-1 text-sm text-text-primary">
      <div className="pb-3">
        <ThemeSelector theme={theme} onChange={changeTheme} />
      </div>
      <div className="pb-3">
        <LangSelector langcode={langcode} onChange={changeLang} />
      </div>
      {toggleSwitchConfigs.map((config) => (
        <div key={config.key} className="pb-3">
          <ToggleSwitch
            stateAtom={config.stateAtom}
            localizationKey={config.localizationKey}
            hoverCardText={config.hoverCardText}
            switchId={config.switchId}
          />
        </div>
      ))}
      <div className="pb-3">
        <ArchivedChats />
      </div>
    </div>
  );
}

export default React.memo(General);
