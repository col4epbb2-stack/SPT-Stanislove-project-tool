import { useEffect, useState } from 'react'
import { FileText, ImageOff, Loader2 } from 'lucide-react'
import { chargerContenuPieceJointe } from '../../lib/piecesJointes'
import type { PieceJointe } from '../../types/pieceJointe'

// Affichage d'une pièce jointe dont le contenu vit dans Firestore, à part de
// ses métadonnées (cf. lib/piecesJointes.ts).
//
// C'est ce découpage qui impose un composant plutôt qu'un simple `<img
// src={pj.url}>` : la liste des pièces est connue tout de suite, leur contenu
// non. Il est donc chargé au montage de la vignette — donc seulement pour ce
// qui est réellement affiché — et mémorisé par le module de chargement, pour
// qu'un changement d'onglet ne le relise pas.

/** Contenu d'une pièce jointe : data URL, ou l'ancienne URL Storage si la
 * pièce date d'avant la bascule. `undefined` tant que le chargement court. */
function useContenu(piece: PieceJointe): string | null | undefined {
  // Ce qui se sait sans rien charger : l'ancienne URL Storage d'une pièce
  // d'avant la bascule, ou l'absence de contenu référencé. Déterminé au rendu
  // plutôt que dans l'effet — poser l'état depuis un effet relance un rendu
  // pour rien.
  const immediat: string | null | undefined = piece.url ?? (piece.contenuId ? undefined : null)
  // Le contenu chargé est mémorisé avec l'id dont il provient : si la pièce
  // change, on n'affiche pas un instant l'image de la précédente.
  const [charge, setCharge] = useState<{ id: string; valeur: string | null } | null>(null)

  useEffect(() => {
    const id = piece.contenuId
    if (immediat !== undefined || !id) return
    let actif = true
    chargerContenuPieceJointe(id)
      .then((valeur) => actif && setCharge({ id, valeur }))
      .catch(() => actif && setCharge({ id, valeur: null }))
    return () => {
      actif = false
    }
  }, [piece.contenuId, immediat])

  if (immediat !== undefined) return immediat
  return charge && charge.id === piece.contenuId ? charge.valeur : undefined
}

/** Vignette cliquable — ouvre l'image en pleine taille dans un onglet. */
export function ImagePieceJointe({
  piece,
  className = 'w-16 h-16 object-cover rounded-lg border border-gray-200',
}: {
  piece: PieceJointe
  className?: string
}) {
  const contenu = useContenu(piece)

  if (contenu === undefined) {
    return (
      <span className={`${className} flex items-center justify-center bg-gray-50 text-gray-300`}>
        <Loader2 className="w-4 h-4 animate-spin" />
      </span>
    )
  }

  if (contenu === null) {
    return (
      <span
        className={`${className} flex items-center justify-center bg-gray-50 text-gray-300`}
        title="Contenu introuvable — la pièce a peut-être été supprimée."
      >
        <ImageOff className="w-4 h-4" />
      </span>
    )
  }

  return (
    <button type="button" onClick={() => ouvrirDansUnOnglet(contenu, piece.nom)} title={`Ouvrir ${piece.nom}`}>
      <img src={contenu} alt={piece.nom} className={className} />
    </button>
  )
}

/** Lien vers une pièce non affichable en vignette (PDF, document). */
export function LienPieceJointe({ piece, children }: { piece: PieceJointe; children?: React.ReactNode }) {
  const [enCours, setEnCours] = useState(false)

  const ouvrir = async () => {
    if (piece.url) {
      window.open(piece.url, '_blank', 'noopener')
      return
    }
    if (!piece.contenuId) return
    setEnCours(true)
    try {
      const contenu = await chargerContenuPieceJointe(piece.contenuId)
      if (contenu) ouvrirDansUnOnglet(contenu, piece.nom)
    } finally {
      setEnCours(false)
    }
  }

  return (
    <button
      type="button"
      onClick={ouvrir}
      disabled={enCours}
      className="inline-flex items-center gap-1.5 min-w-0 text-primary hover:underline disabled:opacity-60"
    >
      {enCours ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : <FileText className="w-3.5 h-3.5 shrink-0" />}
      <span className="truncate">{children ?? piece.nom}</span>
    </button>
  )
}

/**
 * Une data URL ne peut pas être ouverte directement par `window.open` sur les
 * navigateurs récents (bloquée comme navigation de premier niveau). On repasse
 * donc par un Blob et une URL d'objet, révoquée ensuite.
 */
function ouvrirDansUnOnglet(dataUrl: string, nom: string): void {
  const [entete, base64] = dataUrl.split(',')
  const type = /data:([^;]+)/.exec(entete)?.[1] ?? 'application/octet-stream'
  const octets = atob(base64)
  const tableau = new Uint8Array(octets.length)
  for (let i = 0; i < octets.length; i++) tableau[i] = octets.charCodeAt(i)
  const url = URL.createObjectURL(new Blob([tableau], { type }))
  const onglet = window.open(url, '_blank', 'noopener')
  if (!onglet) {
    // Fenêtre bloquée : on retombe sur un téléchargement, qui n'est jamais
    // bloqué et donne accès au fichier quand même.
    const lien = document.createElement('a')
    lien.href = url
    lien.download = nom
    lien.click()
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
