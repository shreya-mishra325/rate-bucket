export interface BucketState {
  tokens: number;
  lastRefill: number;
}

export interface Store {
  get(key: string): Promise<BucketState | undefined>;
  set(key: string, state: BucketState, ttlSeconds: number): Promise<void>;
}
