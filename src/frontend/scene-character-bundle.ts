import soyo from '../../assets/characters/soyo.glb?inline';
import deepseek from '../../assets/characters/deepseek.glb?inline';
import xiaoyang from '../../assets/characters/xiaoyang.glb?inline';
import claude from '../../assets/characters/claude.glb?inline';
import { loadCharacterModel, type CharacterModelId } from './scene-character-assets';

const assets = { soyo, deepseek, xiaoyang, claude };
export const loadBundledCharacter = (id: CharacterModelId) => loadCharacterModel(assets[id]);
