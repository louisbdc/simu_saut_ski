import * as THREE from 'three'

/**
 * Tracés qui se dévoilent avec le temps : traces de ski, marque de dérapage. Le maillage est construit
 * une fois ; on n'en dessine que la partie déjà parcourue, sans rien reconstruire.
 */
interface Reveal {
  /** Instant où le skieur passe sur chaque rangée du tracé, dans l'ordre. */
  readonly times: readonly number[]
  /** Nombre d'indices qui relient une rangée à la suivante. */
  readonly indicesPerRow: number
}

/** Rend un tracé dévoilable : `times[i]` est l'instant de passage sur sa i-ième rangée. */
export function revealable<T extends THREE.Mesh>(mesh: T, times: readonly number[], indicesPerRow: number): T {
  const reveal: Reveal = { times, indicesPerRow }
  mesh.userData.reveal = reveal
  return mesh
}

/** Ne dessine de chaque tracé que ce que le skieur a déjà parcouru à l'instant `time`. */
export function revealUpTo(root: THREE.Object3D, time: number): void {
  root.traverse((object) => {
    const reveal = object.userData.reveal as Reveal | undefined
    if (!reveal || !(object instanceof THREE.Mesh)) return
    const passed = reveal.times.findIndex((rowTime) => rowTime > time)
    const rows = passed === -1 ? reveal.times.length : passed
    object.geometry.setDrawRange(0, Math.max(0, rows - 1) * reveal.indicesPerRow)
  })
}
