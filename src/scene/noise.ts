/**
 * Bruit naturel pour le décor : relief, lisières de forêt, affleurements. Contrairement à une somme
 * de sinus, il ne se répète pas et n'a pas de direction, ce qui évite l'allure de tôle ondulée.
 */

/** Valeur pseudo-aléatoire entre 0 et 1 attachée à un nœud de la grille, toujours la même. */
function lattice(column: number, row: number): number {
  let state = (Math.imul(column, 374761393) + Math.imul(row, 668265263)) | 0
  state = Math.imul(state ^ (state >>> 13), 1274126177)
  return ((state ^ (state >>> 16)) >>> 0) / 4294967296
}

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10)

/** Bruit de valeur lissé entre 0 et 1 : une grille de hasards, raccordés sans cassure. */
export function valueNoise(x: number, y: number): number {
  const column = Math.floor(x)
  const row = Math.floor(y)
  const u = fade(x - column)
  const v = fade(y - row)
  const top = lattice(column, row) + u * (lattice(column + 1, row) - lattice(column, row))
  const bottom = lattice(column, row + 1) + u * (lattice(column + 1, row + 1) - lattice(column, row + 1))
  return top + v * (bottom - top)
}

/**
 * Bruit fractal entre 0 et 1 : plusieurs octaves de bruit de valeur, chacune deux fois plus fine et
 * deux fois moins forte que la précédente. C'est lui qui donne les formes « de montagne ».
 */
export function fbm(x: number, y: number, octaves = 3): number {
  let sum = 0
  let weight = 0
  let amplitude = 1
  let frequency = 1
  for (let octave = 0; octave < octaves; octave++) {
    // Chaque octave est décalée et tournée, pour que leurs grilles ne se superposent pas.
    sum += amplitude * valueNoise(x * frequency + octave * 17.3, y * frequency - octave * 9.1)
    weight += amplitude
    amplitude *= 0.5
    frequency *= 2.03
  }
  // Le bruit de valeur se tasse vers 0,5 : on étire le contraste pour occuper toute la plage.
  const centered = (sum / weight - 0.5) * 1.9
  return Math.min(1, Math.max(0, centered + 0.5))
}
