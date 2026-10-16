// The contract every cache in this chapter keeps: a fixed capacity, and a rule for what leaves when it is full.
export interface Cache<K, V> {
  get(key: K): V | undefined;
  put(key: K, value: V): void;
  delete(key: K): boolean;
  readonly size: number;
  readonly capacity: number;
}
