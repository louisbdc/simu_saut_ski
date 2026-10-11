import * as THREE from 'three'

/** Position du soleil par rapport à ce qu'il éclaire : il fixe la lumière, le disque dans le ciel et le sens des ombres. */
export const SUN_OFFSET = new THREE.Vector3(55, 110, 75)

/** Direction d'où vient la lumière, unitaire. */
export const SUN_DIRECTION = SUN_OFFSET.clone().normalize()
