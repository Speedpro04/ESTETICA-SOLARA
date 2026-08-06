import { StrictMode } from 'react'
import { ViteReactSSG } from 'vite-react-ssg/single-page'
import './index.css'
import App from './App.tsx'

/**
 * Pré-renderização estática (SSG).
 *
 * Antes o build entregava `<div id="root"></div>` vazio: título, textos, planos
 * e FAQ só existiam depois que o navegador baixava e executava o bundle. O
 * Google até renderiza JavaScript, mas numa segunda passada; os rastreadores
 * das buscas por IA, em geral, não renderizam — para eles a página era branca.
 *
 * `ViteReactSSG` roda o App uma vez durante o build e grava o HTML pronto. No
 * navegador o mesmo App hidrata em cima desse HTML, então o comportamento em
 * tempo de execução continua idêntico ao de antes.
 *
 * Modo single-page: na entrada o app é uma tela só (a landing); login, checkout
 * e painel são estados internos, não rotas. Quando virarem rotas de verdade,
 * troca-se este import pelo `ViteReactSSG` com a lista de rotas.
 */
export const createRoot = ViteReactSSG(
  <StrictMode>
    <App />
  </StrictMode>
)
