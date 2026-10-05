'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { crearClienteNavegador } from '@/lib/supabase/client'

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
      options: { scopes: 'email', redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  return (
    <div className="space-y-4">
      {microsoft && (
        <>
          <button type="button" onClick={conMicrosoft} className="btn-sec w-full">
            <svg width="16" height="16" viewBox="0 0 21 21" aria-hidden="true">
              <rect x="1" y="1" width="9" height="9" fill="#f25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
              <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
            </svg>
            Ingresar con Microsoft
          </button>
          <div className="flex items-center gap-3 text-xs text-black/40">
            <span className="h-px flex-1 bg-black/10" />o con email<span className="h-px flex-1 bg-black/10" />
          </div>
        </>
      )}

      <form onSubmit={enviar} className="space-y-3">
        {modo === 'crear' && (
          <div>
            <label className="rotulo" htmlFor="nombre">Nombre y apellido</label>
            <input id="nombre" name="nombre" required className="campo" autoComplete="name" />
          </div>
        )}
        <div>
          <label className="rotulo" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required className="campo" autoComplete="email" />
        </div>
        <div>
          <label className="rotulo" htmlFor="password">Contraseña</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            className="campo"
            autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
          />
        </div>
        {aviso && (
          <p className={`rounded-md px-3 py-2 text-sm ${aviso.tipo === 'error' ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-900'}`}>
            {aviso.texto}
          </p>
        )}
        <button className="btn w-full" disabled={cargando}>
          {cargando ? 'Un momento…' : modo === 'entrar' ? 'Ingresar' : 'Crear cuenta'}
        </button>
      </form>

      <button
        type="button"
        className="w-full text-center text-sm text-marca hover:underline"
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
