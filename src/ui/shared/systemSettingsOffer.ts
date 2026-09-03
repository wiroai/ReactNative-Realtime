/**
 * First time a permanent microphone denial appears, the screen
 * raises an alert once. Dismissing it leaves the toolbar item.
 *
 * Ported from `SystemSettingsOffer.kt`; edge-triggered so a
 * snapshot that stays permanently-denied across renders does not
 * reopen an alert the speaker already dismissed.
 */
export class SystemSettingsOffer {
  private constructor(
    readonly canOpen: boolean,
    readonly showsAlert: boolean,
    private readonly offered: boolean,
  ) {}

  static initial(): SystemSettingsOffer {
    return new SystemSettingsOffer(false, false, false);
  }

  apply(canOpen: boolean): SystemSettingsOffer {
    const offerNow = canOpen && !this.offered;
    const showsAlert = !canOpen ? false : offerNow ? true : this.showsAlert;
    return new SystemSettingsOffer(canOpen, showsAlert, canOpen);
  }

  dismissAlert(): SystemSettingsOffer {
    return new SystemSettingsOffer(this.canOpen, false, this.offered);
  }
}

/** `marin` → `Marin` — the catalog stores option ids lowercase. */
export function displayCatalogValue(value: string): string {
  const first = value.charAt(0);
  return first ? first.toUpperCase() + value.slice(1) : value;
}
