import { ProtocolEventLog } from './protocolEventLog';

describe('ProtocolEventLog', () => {
  it('appends events in order', () => {
    const log = new ProtocolEventLog();

    log.add('one');
    const result = log.add('two');

    expect(result).toEqual(['one', 'two']);
    expect(log.events).toEqual(['one', 'two']);
  });

  it('drops the oldest event once the cap is reached', () => {
    const log = new ProtocolEventLog(2);

    log.add('one');
    log.add('two');
    const result = log.add('three');

    expect(result).toEqual(['two', 'three']);
  });

  it('clears its history', () => {
    const log = new ProtocolEventLog();
    log.add('one');

    log.clear();

    expect(log.events).toEqual([]);
  });

  it('rejects a non-positive cap', () => {
    expect(() => new ProtocolEventLog(0)).toThrow();
  });
});
