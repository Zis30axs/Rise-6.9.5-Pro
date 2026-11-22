import * as THREE from 'three';
import { sites } from './plan';
const siteByKey = new Map(sites.map((site) => [site.key, site]));
/** The nearest visible surface occludes everything behind it, including other registered sites. */
export function hitSite(hit: THREE.Intersection<THREE.Object3D>) {
  for (let node: THREE.Object3D | null = hit.object; node; node = node.parent) {
    if (node.userData.citySite) return siteByKey.get(node.userData.citySite);
  }
  if (hit.faceIndex == null) return;
  const { cityOwners, faceOwners } = hit.object.userData;
  return siteByKey.get(cityOwners?.[faceOwners?.[hit.faceIndex]]);
}
