export interface AutoFitElementLike {
  offsetHeight: number
  classList: { contains(token: string): boolean }
  children: ArrayLike<AutoFitElementLike>
}

const BODY_GAP = 8
const LIST_GAP = 6

export function measureAutoFitContentHeight(
  children: ArrayLike<AutoFitElementLike>,
  criteriaListClassName: string,
): number {
  let contentHeight = 0
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index]
    if (child.classList.contains(criteriaListClassName)) {
      let listHeight = 0
      for (let itemIndex = 0; itemIndex < child.children.length; itemIndex += 1) {
        listHeight += child.children[itemIndex].offsetHeight
      }
      listHeight += Math.max(0, child.children.length - 1) * LIST_GAP
      contentHeight += listHeight
    } else {
      contentHeight += child.offsetHeight
    }
  }
  return contentHeight + Math.max(0, children.length - 1) * BODY_GAP
}
