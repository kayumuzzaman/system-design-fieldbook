// Dates are whole days, counted from 1 January 1970. No clock is read anywhere in this file: "today" is passed in.
export type Day = number;
export const day = (iso: string): Day => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

export type MemberId = string & { readonly __brand: "MemberId" };
export type CopyId = string & { readonly __brand: "CopyId" };
export type Isbn = string & { readonly __brand: "Isbn" };

// What varies between libraries is data, kept in one place.
export interface LendingPolicy {
  readonly maxLoans: number;
  readonly loanDays: number;
  readonly finePerDayCents: number;
  readonly finesBlockAtCents: number;
}
export const standardPolicy: LendingPolicy = { maxLoans: 3, loanDays: 14, finePerDayCents: 25, finesBlockAtCents: 500 };

export class LendingError extends Error {}

export class Loan {
  readonly copy: CopyId;
  readonly member: MemberId;
  readonly borrowedOn: Day;
  readonly dueOn: Day;

  constructor(copy: CopyId, member: MemberId, borrowedOn: Day, loanDays: number) {
    this.copy = copy;
    this.member = member;
    this.borrowedOn = borrowedOn;
    this.dueOn = borrowedOn + loanDays;
  }
  daysLate(returnedOn: Day): number {
    return Math.max(0, returnedOn - this.dueOn);
  }
}

// Owns the rule "one copy is in at most one loan".
export class Copy {
  readonly id: CopyId;
  readonly isbn: Isbn;
  private loan: Loan | null = null;

  constructor(id: CopyId, isbn: Isbn) {
    this.id = id;
    this.isbn = isbn;
  }
  get available(): boolean {
    return this.loan === null;
  }
  get currentLoan(): Loan | null {
    return this.loan;
  }
  lend(loan: Loan): void {
    if (this.loan) throw new LendingError(`copy ${this.id} is already on loan`);
    this.loan = loan;
  }
  takeBack(): Loan {
    if (!this.loan) throw new LendingError(`copy ${this.id} is not on loan`);
    const loan = this.loan;
    this.loan = null;
    return loan;
  }
}

// Owns the rules about one member: how many loans, and how much is owed.
export class Member {
  readonly id: MemberId;
  readonly name: string;
  private readonly loans = new Set<Loan>();
  private owedCents = 0;

  constructor(id: MemberId, name: string) {
    this.id = id;
    this.name = name;
  }
  get openLoans(): number {
    return this.loans.size;
  }
  get finesCents(): number {
    return this.owedCents;
  }

  // Returns the reason this member may not borrow, or null if they may.
  refusal(policy: LendingPolicy): string | null {
    if (this.loans.size >= policy.maxLoans) return `${this.name} already has ${policy.maxLoans} books`;
    if (this.owedCents >= policy.finesBlockAtCents) return `${this.name} owes ${this.owedCents} cents in fines`;
    return null;
  }
  take(loan: Loan): void {
    this.loans.add(loan);
  }
  handBack(loan: Loan, fineCents: number): void {
    if (!this.loans.delete(loan)) throw new LendingError(`${this.name} does not hold that loan`);
    this.owedCents += fineCents;
  }
  pay(cents: number): void {
    if (!Number.isInteger(cents) || cents <= 0 || cents > this.owedCents) throw new LendingError("pay a whole amount, up to what is owed");
    this.owedCents -= cents;
  }
}

// The entry point. It finds the objects, asks them, and keeps the two sides of a loan in step.
export class Library {
  private readonly policy: LendingPolicy;
  private readonly members = new Map<MemberId, Member>();
  private readonly copies = new Map<CopyId, Copy>();

  constructor(policy: LendingPolicy = standardPolicy) {
    this.policy = policy;
  }

  join(id: string, name: string): Member {
    const member = new Member(id as MemberId, name);
    this.members.set(member.id, member);
    return member;
  }
  addCopy(id: string, isbn: string): Copy {
    const copy = new Copy(id as CopyId, isbn as Isbn);
    this.copies.set(copy.id, copy);
    return copy;
  }

  borrow(memberId: string, isbn: string, today: Day): Loan {
    const member = this.member(memberId);
    const refusal = member.refusal(this.policy);
    if (refusal) throw new LendingError(refusal);
    const copy = [...this.copies.values()].find((c) => c.isbn === isbn && c.available);
    if (!copy) throw new LendingError(`no copy of ${isbn} is available`);
    const loan = new Loan(copy.id, member.id, today, this.policy.loanDays);
    copy.lend(loan);
    member.take(loan);
    return loan;
  }

  // Returns the fine charged, in cents.
  giveBack(copyId: string, today: Day): number {
    const copy = this.copies.get(copyId as CopyId);
    if (!copy) throw new LendingError(`no copy ${copyId}`);
    const loan = copy.takeBack();
    const fine = loan.daysLate(today) * this.policy.finePerDayCents;
    this.member(loan.member).handBack(loan, fine);
    return fine;
  }

  member(id: string): Member {
    const member = this.members.get(id as MemberId);
    if (!member) throw new LendingError(`no member ${id}`);
    return member;
  }
  get allCopies(): readonly Copy[] {
    return [...this.copies.values()];
  }
  get allMembers(): readonly Member[] {
    return [...this.members.values()];
  }
}
