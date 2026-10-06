'use client'

import { useEffect, useState } from 'react'
import { latir } from '@/app/(app)/acciones'

/** Avisa si otro agente tiene abierto este ticket o está escribiendo, para no responder dos veces lo mismo. */
export default function Presencia({ ticketId }: { ticketId: string }) {
  const [otros, setOtros] = useState<{ nombre: string; escribiendo: boolean }[]>([])

  useEffect(() => {
    let vivo = true
    const pulso = async () => {
      if (document.hidden) return
      try {
        const campo = document.getElementById('cuerpo') as HTMLTextAreaElement | null
        const lista = await latir(ticketId, !!campo?.value.trim())
        if (vivo) setOtros(lista)
      } catch {
        // sin conexión: se reintenta en el próximo pulso
      }
    }
    pulso()
    const reloj = setInterval(pulso, 20000)
    return () => {
      vivo = false
      clearInterval(reloj)
    }
  }, [ticketId])

  if (!otros.length) return null
  const escriben = otros.filter((o) => o.escribiendo)
  return (
    <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800" role="status">
      {escriben.length
        ? `${escriben.map((o) => o.nombre).join(', ')} ${escriben.length > 1 ? 'están' : 'está'} escribiendo una respuesta en este ticket.`
        : `${otros.map((o) => o.nombre).join(', ')} también ${otros.length > 1 ? 'tienen' : 'tiene'} abierto este ticket.`}
    </p>
  )
}
