import { SystemSettingsOffer, displayCatalogValue } from './systemSettingsOffer';

describe('SystemSettingsOffer', () => {
  it('offers the alert once when denial turns permanent', () => {
    let offer = SystemSettingsOffer.initial();
    expect(offer.showsAlert).toBe(false);

    offer = offer.apply(true);
    expect(offer.canOpen).toBe(true);
    expect(offer.showsAlert).toBe(true);

    offer = offer.apply(true);
    expect(offer.showsAlert).toBe(true);

    offer = offer.dismissAlert();
    expect(offer.showsAlert).toBe(false);
    expect(offer.canOpen).toBe(true);

    offer = offer.apply(true);
    expect(offer.showsAlert).toBe(false);
  });

  it('clears when the denial lifts', () => {
    let offer = SystemSettingsOffer.initial().apply(true);
    offer = offer.apply(false);
    expect(offer.canOpen).toBe(false);
    expect(offer.showsAlert).toBe(false);

    offer = offer.apply(true);
    expect(offer.showsAlert).toBe(true);
  });
});

describe('displayCatalogValue', () => {
  it('capitalizes the first letter', () => {
    expect(displayCatalogValue('marin')).toBe('Marin');
    expect(displayCatalogValue('')).toBe('');
  });
});
