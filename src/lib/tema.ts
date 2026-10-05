// Modo claro / oscuro. Se guarda por navegador; sin elección guardada sigue la configuración del sistema.
// Usa la misma clave que Accusys Cyber, pero cada app guarda la suya porque están en dominios distintos.
const CLAVE = 'accusys-tema'

export function estaOscuro() {
  return document.documentElement.classList.contains('dark')
}

export function alternarTema() {
  const oscuro = !estaOscuro()
  document.documentElement.classList.toggle('dark', oscuro)
  try {
    localStorage.setItem(CLAVE, oscuro ? 'oscuro' : 'claro')
  } catch {}
  return oscuro
}

// Se ejecuta en el <head> antes de dibujar la página, para que no parpadee en blanco
export const SCRIPT_TEMA = `(function(){try{var t=localStorage.getItem("${CLAVE}");var o=t==="oscuro"||(t!=="claro"&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(o)document.documentElement.classList.add("dark")}catch(e){}})()`
