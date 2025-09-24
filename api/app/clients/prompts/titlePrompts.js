const {
  ChatPromptTemplate,
  SystemMessagePromptTemplate,
  HumanMessagePromptTemplate,
} = require('@langchain/core/prompts');

const langPrompt = new ChatPromptTemplate({
  promptMessages: [
    SystemMessagePromptTemplate.fromTemplate('Detecta el idioma utilizado en el siguiente texto.'),
    HumanMessagePromptTemplate.fromTemplate('{inputText}'),
  ],
  inputVariables: ['inputText'],
});

const createTitlePrompt = ({ convo }) => {
  const titlePrompt = new ChatPromptTemplate({
    promptMessages: [
      SystemMessagePromptTemplate.fromTemplate(
        `Escribe un título conciso para esta conversación en el idioma dado. Título en 5 palabras o menos. Sin puntuación ni comillas. Debe estar en formato de título, escrito en el idioma dado.
${convo}`,
      ),
      HumanMessagePromptTemplate.fromTemplate('Idioma: {language}'),
    ],
    inputVariables: ['language'],
  });

  return titlePrompt;
};

const titleInstruction =
  'un título conciso de 5 palabras o menos para la conversación, usando el mismo idioma, sin puntuación. Aplica las convenciones de formato de título apropiadas para el idioma. Nunca menciones directamente el nombre del idioma o la palabra "título"';
const titleFunctionPrompt = `En este entorno tienes acceso a un conjunto de herramientas que puedes usar para generar el título de la conversación.
  
Puedes llamarlas así:
<function_calls>
<invoke>
<tool_name>$TOOL_NAME</tool_name>
<parameters>
<$PARAMETER_NAME>$PARAMETER_VALUE</$PARAMETER_NAME>
...
</parameters>
</invoke>
</function_calls>

Aquí están las herramientas disponibles:
<tools>
<tool_description>
<tool_name>submit_title</tool_name>
<description>
Envía un título breve en el idioma de la conversación, siguiendo de cerca la descripción del parámetro.
</description>
<parameters>
<parameter>
<name>title</name>
<type>string</type>
<description>${titleInstruction}</description>
</parameter>
</parameters>
</tool_description>
</tools>`;

const genTranslationPrompt = (
  translationPrompt,
) => `En este entorno tienes acceso a un conjunto de herramientas que puedes usar para traducir texto.
  
Puedes llamarlas así:
<function_calls>
<invoke>
<tool_name>$TOOL_NAME</tool_name>
<parameters>
<$PARAMETER_NAME>$PARAMETER_VALUE</$PARAMETER_NAME>
...
</parameters>
</invoke>
</function_calls>

Aquí están las herramientas disponibles:
<tools>
<tool_description>
<tool_name>submit_translation</tool_name>
<description>
Envía una traducción en el idioma objetivo, siguiendo de cerca la descripción del parámetro y su idioma.
</description>
<parameters>
<parameter>
<name>translation</name>
<type>string</type>
<description>${translationPrompt}
SOLO incluye la traducción generada sin comillas, ni su clave relacionada</description>
</parameter>
</parameters>
</tool_description>
</tools>`;

/**
 * Parses specified parameter from the provided prompt.
 * @param {string} prompt - The prompt containing the desired parameter.
 * @param {string} paramName - The name of the parameter to extract.
 * @returns {string} The parsed parameter's value or a default value if not found.
 */
function parseParamFromPrompt(prompt, paramName) {
  // Handle null/undefined prompt
  if (!prompt) {
    return `No ${paramName} provided`;
  }

  // Try original format first: <title>value</title>
  const simpleRegex = new RegExp(`<${paramName}>(.*?)</${paramName}>`, 's');
  const simpleMatch = prompt.match(simpleRegex);

  if (simpleMatch) {
    return simpleMatch[1].trim();
  }

  // Try parameter format: <parameter name="title">value</parameter>
  const paramRegex = new RegExp(`<parameter name="${paramName}">(.*?)</parameter>`, 's');
  const paramMatch = prompt.match(paramRegex);

  if (paramMatch) {
    return paramMatch[1].trim();
  }

  if (prompt && prompt.length) {
    return `NO TOOL INVOCATION: ${prompt}`;
  }
  return `No ${paramName} provided`;
}

module.exports = {
  langPrompt,
  titleInstruction,
  createTitlePrompt,
  titleFunctionPrompt,
  parseParamFromPrompt,
  genTranslationPrompt,
};
