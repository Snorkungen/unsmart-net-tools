# `TerminalRenderer` Supported escape codes

- Intro
- [Navigation](#navigation)
- [Erase](#erase)
- [Scrolling](#scrolling)
- [Select Graphic Rendetion](#select-graphic-rendetion)
- [References](#references)

## Intro

> `ESC[` => `CSI` \
> Format `CSI` param1; param2; ... [Final Byte]

## Navigation

`CSI` n *A* - Cursor Up \
`CSI` n *B* - Cursor Down \
`CSI` n *C* - Cursor Forward \
`CSI` n *D* - Cursor Backward \
Where **n** (default 1) determines the size of the step.

`CSI` n *E* - Cursor Next Line \
`CSI` n *F* - Cursor Previous Line \
Where **n** (default 1) determines the lines moved. Theese actions move the cursor (up/down) and sets the cursor to the beginning of the row.

`CSI` n *G* - Set Cursor Horizontal Absolute \
Where **n** (default 1 &  1-based i.e. 1,2,3,...) is the horizontal position of the cursor.

`CSI` n; m [*H* *f*] - Set cursor position \
Where **n** (i.e. Y-position;  1-based i.e. 1,2,3,...) is is the row where cursor is to be placed. And where **m** (i.e. X-position;  1-based i.e. 1,2,3,...) is the column to where the cursor is to be placed.

## Erase

`CSI` n *J* - Erase in display \
Where **n** (default 2) is a parameter that determines what row that the erasure starts from. If n is 0 then the terminal gets erase from row that the cursor is on to the end, if n is 1 startin and including the current row the cursor is on to the beginning and if n is 2 the whole terminal content gets cleared and cursor gets reset.

`CSI` n *K* - Erase in line \
Where **n** (default 2) determinse what gets erased. If n is 0 the line gets erased startin from the cursor position to the end, if n is 1 the line gets erased from the start to the cursor position, if n is 2 the entire row gets cleared the cursor remains in position.

## Scrolling

`CSI` n *S* - Scroll up \
`CSI` n *T* - Scroll down \
Where **n** (default 1) determinse by how many pages/views are scrolled. If scrolling down page gets filled with extra rows so to show an entire row.

## Select Graphic Rendetion

> Configure `TerminalRenderer`

`CSI` n *m* - Select Graphic Rendetion \
Where **n** is the parameter that determine what configuration to take place. Below is a list with parameters that are implemented.

- *0* - Reset configurations to default
- *7* - Invert colors (i.e. Background color becomes Foreground  color and the Foreground becomes the Background color.)
- *30*-*37* - Select the foreground from the 8 options. (i.e. *31* sets color option number 2 as the foreground color.)
- *40*-*47* - Select the background from the 8 options. (i.e. *45* sets color option number 6 as the background color.)

## References

[Wikipedia - ANSI escape codes](https://en.wikipedia.org/wiki/ANSI_escape_code)
