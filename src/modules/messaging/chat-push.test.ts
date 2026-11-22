import { describe, expect, it } from 'vitest';
import { keyToBytes, rememberChatLink, takeChatLink } from './chat-push';

describe('notifications Web Push', () => {
  it('convertit la clé publique du serveur en octets', () => {
    // « AQID-w » en base64 URL-safe = octets 1, 2, 3, 251
    expect(Array.from(keyToBytes('AQID-w'))).toEqual([1, 2, 3, 251]);
  });

  it('accepte une clé avec ou sans remplissage', () => {
    expect(Array.from(keyToBytes('AQI'))).toEqual([1, 2]);
    expect(Array.from(keyToBytes('AQI='))).toEqual([1, 2]);
  });

  it('retient le lien d\'une discussion à travers la reconnexion, une seule fois', () => {
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/#chat=42');
    rememberChatLink();
    expect(window.location.hash).toBe('');
    expect(takeChatLink()).toBe('42');
    expect(takeChatLink()).toBeNull();
  });

  it('ignore une adresse sans lien de discussion', () => {
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/#autre');
    rememberChatLink();
    expect(takeChatLink()).toBeNull();
  });
});
