import math

"""
def get_ticks(min, max):
    ran = max - min
    exp = math.ceil(math.log10(ran)) - 1.0
    man = ran / 10.0 ** exp

    for new_man in (2.5, 5.0, 10.0):
        if man <= new_man:
            return [new_man * 10.0 ** exp * i / 5.0 for i in range(6)]
"""

def get_ticks(min, max):
    ran = max - min
    exp = math.ceil(math.log10(ran)) - 1.0
    man = ran / 10.0 ** exp

    for new_man in (2.5, 5.0, 10.0):
        if man <= new_man:
            inc = new_man * 10.0 ** exp / 5.0
            new_min = (min // inc) * inc
            return [new_man * 10.0 ** exp * i / 5.0 + new_min for i in range(6)]

for i in [*range(2, 10), *range(10, 100, 10)]:
    min = 1.0
    max = float(i)
    ticks = get_ticks(min, max)
    print(f"{i=} {ticks=}")
