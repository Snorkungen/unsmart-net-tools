import sys, tty, termios

# Source <https://stackoverflow.com/questions/22397289/finding-the-values-of-the-arrow-keys-in-python-why-are-they-triples>


class _Getch:
    def __call__(self):
        fd = sys.stdin.fileno()
        old_settings = termios.tcgetattr(fd)
        try:
            tty.setraw(sys.stdin.fileno())
            ch = sys.stdin.read(1)
        finally:
            termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)
        return ch


def get():
    inkey = _Getch()
    while 1:
        k = inkey()
        if k != "":
            break

    if ord(k) > 31:
        print(ord(k), f" {k}")
    else: print(ord(k))

    # quit if ^C is pressed
    if ord(k) == 3:
        exit()    

def main():
    print(f"Usage: press character\n\tPress ^C to quit")
    while True: 
        get()

if __name__ == "__main__":
    main()
