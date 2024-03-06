const cache = new Map<string, any>();

export const DB_KEYS = {
    NUM_TRADES: 'NUM_TRADES',
    NUM_TRADES_SUCCESS: 'NUM_TRADES_SUCCESS',
    NUM_TRADES_FAIL: 'NUM_TRADES_FAIL',
}

export function getItem<T>(key: string): T {
    return cache.get(key) ;
}

export function setItem<T>(key: string, value: T) {
    cache.set(key, value);
}

export function incrementItem(key: string, value: number) {
  const currentValue = cache.get(key) || 0;
  cache.set(key, currentValue + value);
}

export function getAll() {
    return cache
}