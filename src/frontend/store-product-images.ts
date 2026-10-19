// Exact RGBA copies; original PNGs remain alongside the lossless derivatives.
import mealBasic from '../../assets/store-products/lossless/meal-basic.webp?inline';
import mealStandard from '../../assets/store-products/lossless/meal-standard.webp?inline';
import mealPremium from '../../assets/store-products/lossless/meal-premium.webp?inline';
import snackBasic from '../../assets/store-products/lossless/snack-basic.webp?inline';
import snackStandard from '../../assets/store-products/lossless/snack-standard.webp?inline';
import snackPremium from '../../assets/store-products/lossless/snack-premium.webp?inline';
import drinkBasic from '../../assets/store-products/lossless/drink-basic.webp?inline';
import drinkStandard from '../../assets/store-products/lossless/drink-standard.webp?inline';
import drinkPremium from '../../assets/store-products/lossless/drink-premium.webp?inline';
import cigaretteBasic from '../../assets/store-products/lossless/cigarette-basic.webp?inline';
import cigaretteStandard from '../../assets/store-products/lossless/cigarette-standard.webp?inline';
import cigarettePremium from '../../assets/store-products/lossless/cigarette-premium.webp?inline';

const images = Object.freeze({
  'meal-basic': mealBasic, 'meal-standard': mealStandard, 'meal-premium': mealPremium,
  'snack-basic': snackBasic, 'snack-standard': snackStandard, 'snack-premium': snackPremium,
  'drink-basic': drinkBasic, 'drink-standard': drinkStandard, 'drink-premium': drinkPremium,
  'cigarette-basic': cigaretteBasic, 'cigarette-standard': cigaretteStandard, 'cigarette-premium': cigarettePremium,
});

/** Never construct a URL or accept a path from dialogue, save data or item names. */
export function getStoreProductImage(itemId: string): string | null {
  return Object.hasOwn(images, itemId) ? images[itemId as keyof typeof images] : null;
}
