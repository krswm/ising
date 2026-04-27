import math
import random

def get_ticks(min, max):
    ran = max - min
    exp = math.ceil(math.log10(ran)) - 1
    man = ran / 10.0 ** exp

    for new_man, alt_exp, alt_man in [
        (2.5, exp, 5.0), (5.0, exp, 10.0), (10.0, exp + 1, 2.5)
    ]:
        if man <= new_man:
            inc = new_man * 10.0 ** exp / 5.0
            new_min = (min // inc) * inc
            new_max = new_man * 10.0 ** exp + new_min
            if max <= new_max:
                min = new_min
                man = new_man
            else:
                exp = alt_exp
                man = alt_man
                inc = man * 10.0 ** exp / 5.0
                min = (min // inc) * inc
            break

    return [man * 10.0 ** exp * i / 5.0 + min for i in range(6)]

def test(min, max, expected):
    assert expected[0] <= min <= max <= expected[-1]

    result = get_ticks(min, max)
    
    if result == expected:
        print(
            f"{min:8} {max:8} {result!r:40} \x1b[32m==\x1b[39m {expected!r:40}"
        )
    else:
        print(
            f"{min:8} {max:8} {result!r:40} \x1b[31m!=\x1b[39m {expected!r:40}"
        )

def test_a():
    test(0.0, 5e-1, [0.0, 1e-1, 2e-1, 3e-1, 4e-1, 5e-1])
    test(0.0, 5e0, [0.0, 1e0, 2e0, 3e0, 4e0, 5e0])
    test(0.0, 5e1, [0.0, 1e1, 2e1, 3e1, 4e1, 5e1])
    test(0.0, 10e-1, [0.0, 2e-1, 4e-1, 6e-1, 8e-1, 10e-1])
    test(0.0, 10e0, [0.0, 2e0, 4e0, 6e0, 8e0, 10e0])
    test(0.0, 10e1, [0.0, 2e1, 4e1, 6e1, 8e1, 10e1])
    test(0.0, 25e-1, [0.0, 5e-1, 10e-1, 15e-1, 20e-1, 25e-1])
    test(0.0, 25e0, [0.0, 5e0, 10e0, 15e0, 20e0, 25e0])
    test(0.0, 25e1, [0.0, 5e1, 10e1, 15e1, 20e1, 25e1])

    test(1e0, 6e0, [1e0, 2e0, 3e0, 4e0, 5e0, 6e0])
    test(2e0, 12e0, [2e0, 4e0, 6e0, 8e0, 10e0, 12e0])
    test(5e0, 30e0, [5e0, 10e0, 15e0, 20e0, 25e0, 30e0])

    test(-1e0, 4e0, [-1e0, 0.0, 1e0, 2e0, 3e0, 4e0])
    test(-2e0, 8e0, [-2e0, 0.0, 2e0, 4e0, 6e0, 8e0])
    test(-5e0, 20e0, [-5e0, 0.0, 5e0, 10e0, 15e0, 20e0])

    test(0.0, 4.5e0, [0.0, 1e0, 2e0, 3e0, 4e0, 5e0])
    test(0.0, 9e0, [0.0, 2e0, 4e0, 6e0, 8e0, 10e0])
    test(0.0, 24e0, [0.0, 5e0, 10e0, 15e0, 20e0, 25e0])

    test(0.5, 5e0, [0.0, 1e0, 2e0, 3e0, 4e0, 5e0])
    test(1e0, 10e0, [0.0, 2e0, 4e0, 6e0, 8e0, 10e0])
    test(3.13e0, 25e0, [0.0, 5e0, 10e0, 15e0, 20e0, 25e0])

    test(0.5, 4.5e0, [0.0, 1e0, 2e0, 3e0, 4e0, 5e0])
    test(1e0, 9e0, [0.0, 2e0, 4e0, 6e0, 8e0, 10e0])
    test(3.13e0, 24e0, [0.0, 5e0, 10e0, 15e0, 20e0, 25e0])

    test(-0.1, 5.1, [-2.0, 0.0, 2.0, 4.0, 6.0, 8.0])
    test(1.1, 3.1, [1.0, 1.5, 2.0, 2.5, 3.0, 3.5])
    test(1.7, 3.1, [1.5, 2.0, 2.5, 3.0, 3.5, 4.0])

    test(0.9, 3.1, [0.0, 1.0, 2.0, 3.0, 4.0, 5.0])  # ran == 2.5
    test(0.1, 2.6, [0.0, 1.0, 2.0, 3.0, 4.0, 5.0])  # ran == 2.5
    test(1.9, 6.9, [0.0, 2.0, 4.0, 6.0, 8.0, 10.0])  # ran == 5.0
    test(0.1, 5.1, [0.0, 2.0, 4.0, 6.0, 8.0, 10.0])  # ran == 5.0
    test(4.9, 14.9, [0.0, 5.0, 10.0, 15.0, 20.0, 25.0])  # ran == 10.0
    test(0.1, 10.1, [0.0, 5.0, 10.0, 15.0, 20.0, 25.0])  # ran == 10.0

def test_b():
    for _ in range(10):
        min, max = sorted(20.0 * random.random() - 10.0 for _ in range(2))
        print(f"{min:10f} {max:10f} {get_ticks(min, max)}")

test_b()
