'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { crearClienteNavegador } from '@/lib/supabase/client'

const CAMPO =
  'block w-full rounded-xl border border-white/25 bg-white/10 px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/60 focus:ring-2 focus:ring-white/25'
const ROTULO = 'mb-1 block text-sm font-medium text-white/80'

export default function Formulario({ microsoft }: { microsoft: boolean }) {
  const router = useRouter()
  const [modo, setModo] = useState<'entrar' | 'crear'>('entrar')
  const [aviso, setAviso] = useState<{ tipo: 'error' | 'ok'; texto: string } | null>(null)
  const [cargando, setCargando] = useState(false)

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setAviso(null)
    setCargando(true)
    const f = new FormData(e.currentTarget)
    const email = String(f.get('email'))
    const password = String(f.get('password'))
    const supabase = crearClienteNavegador()

    if (modo === 'entrar') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setAviso({ tipo: 'error', texto: 'Email o contraseña incorrectos.' })
      else {
        router.push('/')
        router.refresh()
        return
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: String(f.get('nombre') || '') },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (error) setAviso({ tipo: 'error', texto: error.message })
      else if (data.session) {
        router.push('/')
        router.refresh()
        return
      } else setAviso({ tipo: 'ok', texto: 'Te enviamos un mail para confirmar la cuenta. Abrilo y volvé a ingresar.' })
    }
    setCargando(false)
  }

  async function conMicrosoft() {
    const supabase = crearClienteNavegador()
    await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: { scopes: 'email openid profile', redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  return (
    <div className="space-y-4">
      {microsoft && (
        <>
          <button type="button" onClick={conMicrosoft} className="flex w-full items-center justify-center gap-3 rounded-xl bg-white py-3.5 font-medium text-[#1F2937] shadow-lg shadow-black/10 transition hover:bg-white/95">
            <svg width="20" height="20" viewBox="0 0 21 21" aria-hidden="true">
              <rect x="1" y="1" width="9" height="9" fill="#f25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
              <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
            </svg>
            Continuar con Microsoft
          </button>
          <div className="flex items-center gap-3 text-xs text-white/50">
            <span className="h-px flex-1 bg-white/20" />o con email<span className="h-px flex-1 bg-white/20" />
          </div>
        </>
      )}

      <form onSubmit={enviar} className="space-y-3">
        {modo === 'crear' && (
          <div>
            <label className={ROTULO} htmlFor="nombre">Nombre y apellido</label>
            <input id="nombre" name="nombre" required className={CAMPO} autoComplete="name" />
          </div>
        )}
        <div>
          <label className={ROTULO} htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required className={CAMPO} autoComplete="email" />
        </div>
        <div>
          <label className={ROTULO} htmlFor="password">Contraseña</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            className={CAMPO}
            autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
          />
        </div>
        {aviso && (
          <p className={`rounded-lg px-3 py-2 text-sm ${aviso.tipo === 'error' ? 'border border-red-300/30 bg-red-500/25 text-red-100' : 'bg-white/15'}`}>
            {aviso.texto}
          </p>
        )}
        <button
          className={`w-full rounded-xl py-3 font-medium transition disabled:opacity-70 ${
            microsoft ? 'border border-white/30 bg-white/10 text-white hover:bg-white/20' : 'bg-white text-[#1F2937] shadow-lg shadow-black/10 hover:bg-white/95'
          }`}
          disabled={cargando}
        >
          {cargando ? 'Un momento…' : modo === 'entrar' ? 'Ingresar' : 'Crear cuenta'}
        </button>
      </form>

      <button
        type="button"
        className="w-full text-center text-sm text-white/75 underline-offset-2 hover:text-white hover:underline"
        onClick={() => {
          setModo(modo === 'entrar' ? 'crear' : 'entrar')
          setAviso(null)
        }}
      >
        {modo === 'entrar' ? '¿No tenés cuenta? Creá una' : 'Ya tengo cuenta'}
      </button>
    </div>
  )
}
