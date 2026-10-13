'use client'

import { useFormStatus } from 'react-dom'

export default function Enviar() {
  const { pending } = useFormStatus()
  return (
    <button className="btn" disabled={pending}>
      {pending ? 'Analizando el correo…' : 'Reportar'}
    </button>
  )
}
