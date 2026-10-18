/**
 * What the keyboard's return key does in field `index` of `count` chained fields: "next" moves to
 * the following field and keeps the keyboard up; "done" on the last one runs the form's primary
 * action. The web forms follow the same rule with Enter (`packages/ui` `Form`).
 */
export function chainStep(
  index: number,
  count: number,
): { returnKeyType: 'next' | 'done'; submitBehavior: 'submit' | 'blurAndSubmit'; last: boolean } {
  const last = index >= count - 1;
  return last
    ? { returnKeyType: 'done', submitBehavior: 'blurAndSubmit', last }
    : { returnKeyType: 'next', submitBehavior: 'submit', last };
}
