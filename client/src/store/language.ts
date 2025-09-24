import Cookies from 'js-cookie';
import { atomWithLocalStorage } from './utils';

const defaultLang = () => {
  // 🆕 SIEMPRE ESPAÑOL: Ignora detección automática del navegador  
  return Cookies.get('lang') || localStorage.getItem('lang') || 'es';
};

const lang = atomWithLocalStorage('lang', defaultLang());

export default { lang };
