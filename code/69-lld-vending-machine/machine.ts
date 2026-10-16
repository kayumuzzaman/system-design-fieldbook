import { makeChange, total, type Coin, type CoinCounts } from "./change.ts";

// The port to the physical machine. In tests it is a fake that records what it was told to do.
export interface Hardware {
  release(slot: string): void;        // turn the spiral; the machine reports back with delivered() or failed()
  returnCoins(coins: Coin[]): void;   // drop coins into the tray
  show(message: string): void;
}

export class MachineError extends Error {}

export class Slot {
  readonly code: string;
  name: string;
  priceCents: number;
  private count: number;
  private jammed = false;

  constructor(code: string, name: string, priceCents: number, count: number) {
    this.code = code; this.name = name; this.priceCents = priceCents; this.count = count;
  }
  get quantity(): number { return this.count; }
  get sellable(): boolean { return this.count > 0 && !this.jammed; }
  takeOne(): void {
    if (this.count === 0) throw new MachineError(`slot ${this.code} is empty`);
    this.count -= 1;
  }
  markJammed(): void { this.jammed = true; }
  refill(count: number): void { this.count = count; this.jammed = false; }
}

// The machine's own money. Coins a customer has inserted are not in here until the sale completes.
export class CashBox {
  private readonly counts = new Map<Coin, number>();

  constructor(float: CoinCounts = {}) {
    for (const [coin, count] of Object.entries(float)) this.counts.set(Number(coin) as Coin, count);
  }
  get available(): CoinCounts { return Object.fromEntries(this.counts); }
  get totalCents(): number { return [...this.counts].reduce((sum, [coin, count]) => sum + coin * count, 0); }
  add(coins: readonly Coin[]): void {
    for (const coin of coins) this.counts.set(coin, (this.counts.get(coin) ?? 0) + 1);
  }
  remove(coins: readonly Coin[]): void {
    for (const coin of coins) {
      const have = this.counts.get(coin) ?? 0;
      if (have === 0) throw new MachineError(`no ${coin}-cent coin left to give`);
      this.counts.set(coin, have - 1);
    }
  }
  empty(): Coin[] {
    const all = [...this.counts].flatMap(([coin, count]) => Array.from({ length: count }, () => coin));
    this.counts.clear();
    return all;
  }
}

export type StateName = "idle" | "awaiting payment" | "dispensing" | "maintenance";

// Every state answers every event, and returns the state the machine is in afterward.
interface MachineState {
  readonly name: StateName;
  select(m: VendingMachine, code: string): MachineState;
  insert(m: VendingMachine, coin: Coin): MachineState;
  cancel(m: VendingMachine): MachineState;
  delivered(m: VendingMachine): MachineState;
  failed(m: VendingMachine): MachineState;
  openService(m: VendingMachine): MachineState;
  closeService(m: VendingMachine): MachineState;
}

// The default answers: a coin that is not wanted is handed straight back, and everything else changes nothing.
abstract class Base implements MachineState {
  abstract readonly name: StateName;
  select(m: VendingMachine, _code: string): MachineState { m.hardware.show("Please wait"); return this; }
  insert(m: VendingMachine, coin: Coin): MachineState { m.hardware.returnCoins([coin]); return this; }
  cancel(_m: VendingMachine): MachineState { return this; }
  delivered(_m: VendingMachine): MachineState { return this; }
  failed(_m: VendingMachine): MachineState { return this; }
  openService(_m: VendingMachine): MachineState { throw new MachineError(`cannot open for service while ${this.name}`); }
  closeService(_m: VendingMachine): MachineState { throw new MachineError("the machine is not open for service"); }
}

class Idle extends Base {
  readonly name = "idle";
  override select(m: VendingMachine, code: string): MachineState {
    const slot = m.slots.get(code);
    if (!slot) { m.hardware.show(`No slot ${code}`); return this; }
    if (!slot.sellable) { m.hardware.show(`${slot.name} is sold out`); return this; }
    m.hardware.show(`${slot.name}: ${slot.priceCents}`);
    return new AwaitingPayment(slot);
  }
  override insert(m: VendingMachine, coin: Coin): MachineState {
    m.hardware.show("Choose a product first");
    return super.insert(m, coin);
  }
  override openService(): MachineState { return new Maintenance(); }
}

class AwaitingPayment extends Base {
  readonly name = "awaiting payment";
  private readonly slot: Slot;
  private readonly inserted: Coin[] = []; // held for the customer, not yet the machine's

  constructor(slot: Slot) { super(); this.slot = slot; }

  override select(m: VendingMachine, code: string): MachineState {
    if (this.inserted.length > 0) { m.hardware.show("Cancel first to choose again"); return this; }
    return new Idle().select(m, code);
  }
  override insert(m: VendingMachine, coin: Coin): MachineState {
    this.inserted.push(coin);
    const paid = total(this.inserted);
    if (paid < this.slot.priceCents) { m.hardware.show(`${this.slot.priceCents - paid} more`); return this; }
    // Enough has been paid. Change may come from the cash box or from the coins just inserted.
    const pool = new CashBox(m.cash.available); pool.add(this.inserted);
    const change = makeChange(paid - this.slot.priceCents, pool.available);
    if (!change) {
      m.hardware.show("Cannot give change. Use the exact amount");
      m.hardware.returnCoins(this.inserted);
      return new Idle();
    }
    m.hardware.release(this.slot.code);
    return new Dispensing(this.slot, this.inserted, change);
  }
  override cancel(m: VendingMachine): MachineState {
    if (this.inserted.length > 0) m.hardware.returnCoins(this.inserted);
    return new Idle();
  }
}

class Dispensing extends Base {
  readonly name = "dispensing";
  private readonly slot: Slot;
  private readonly inserted: Coin[];
  private readonly change: Coin[];

  constructor(slot: Slot, inserted: Coin[], change: Coin[]) { super(); this.slot = slot; this.inserted = inserted; this.change = change; }

  // Only now, with the product in the tray, does the customer's money become the machine's.
  override delivered(m: VendingMachine): MachineState {
    this.slot.takeOne();
    m.cash.add(this.inserted);
    m.cash.remove(this.change);
    if (this.change.length > 0) m.hardware.returnCoins(this.change);
    m.hardware.show("Thank you");
    return new Idle();
  }
  override failed(m: VendingMachine): MachineState {
    this.slot.markJammed();
    m.hardware.returnCoins(this.inserted);
    m.hardware.show("Sorry, that did not work. Your money has been returned");
    return new Idle();
  }
}

class Maintenance extends Base {
  readonly name = "maintenance";
  override select(m: VendingMachine): MachineState { m.hardware.show("Out of service"); return this; }
  override openService(): MachineState { return this; }
  override closeService(): MachineState { return new Idle(); }
}

// The context: it owns the stock and the money, and passes every event to its current state.
export class VendingMachine {
  readonly slots = new Map<string, Slot>();
  readonly cash: CashBox;
  readonly hardware: Hardware;
  private current: MachineState = new Idle();

  constructor(hardware: Hardware, slots: Slot[], float: CoinCounts) {
    this.hardware = hardware;
    this.cash = new CashBox(float);
    for (const slot of slots) this.slots.set(slot.code, slot);
  }
  get state(): StateName { return this.current.name; }

  // The customer's buttons and the coin slot.
  select(code: string): void { this.current = this.current.select(this, code); }
  insert(coin: Coin): void { this.current = this.current.insert(this, coin); }
  cancel(): void { this.current = this.current.cancel(this); }
  // Signals from the delivery sensor.
  delivered(): void { this.current = this.current.delivered(this); }
  failed(): void { this.current = this.current.failed(this); }
  // The operator's key.
  openService(): void { this.current = this.current.openService(this); }
  closeService(): void { this.current = this.current.closeService(this); }

  restock(code: string, count: number): void {
    this.mustBeOpen();
    const slot = this.slots.get(code);
    if (!slot) throw new MachineError(`no slot ${code}`);
    slot.refill(count);
  }
  collectCash(leave: CoinCounts): Coin[] {
    this.mustBeOpen();
    const taken = this.cash.empty();
    const float = Object.entries(leave).flatMap(([coin, count]) => Array.from({ length: count ?? 0 }, () => Number(coin) as Coin));
    for (const coin of float) {
      const at = taken.indexOf(coin);
      if (at < 0) throw new MachineError(`not enough ${coin}-cent coins to leave as a float`);
      taken.splice(at, 1);
    }
    this.cash.add(float);
    return taken;
  }
  private mustBeOpen(): void {
    if (this.current.name !== "maintenance") throw new MachineError("open the machine for service first");
  }
}
