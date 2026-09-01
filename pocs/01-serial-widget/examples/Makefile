# Makefile for STM32 telemetry test firmware (libopencm3)
#
# Prerequisites:
#   - arm-none-eabi-gcc
#   - libopencm3 (installed or built locally)
#
# Usage:
#   make                 # build
#   make flash           # flash via st-flash (STLink)
#   make clean           # clean build artifacts
#
# To change target MCU:
#   OPENCM3_TARGET=stm32f103c8  (Blue Pill)
#   OPENCM3_TARGET=stm32f401re  (Nucleo-F401RE, default)
#   OPENCM3_TARGET=stm32f446re  (Nucleo-F446RE)

# ---- Target MCU ----
OPENCM3_TARGET ?= stm32f401re

# ---- Toolchain ----
PREFIX  = arm-none-eabi-
CC      = $(PREFIX)gcc
LD      = $(PREFIX)gcc
OBJCOPY = $(PREFIX)objcopy
SIZE    = $(PREFIX)size
STFLASH = st-flash

# ---- libopencm3 location ----
# If installed system-wide, leave OPENCM3_DIR empty.
# If built locally, point to the libopencm3 root:
OPENCM3_DIR ?=
ifeq ($(OPENCM3_DIR),)
  OPENCM3_LIB  = opencm3
  OPENCM3_INC  =
else
  OPENCM3_LIB  = $(OPENCM3_DIR)/lib/libopencm3_$(OPENCM3_TARGET).a
  OPENCM3_INC  = -I$(OPENCM3_DIR)/include
endif

# ---- Project ----
TARGET  = stm32_telemetry
SRC     = stm32_telemetry.c
LDSCRIPT = $(OPENCM3_DIR)/lib/loaders/irq29_memory.ld

# ---- Flags ----
CPU     = -mcpu=cortex-m4 -mthumb -mfloat-abi=hard -mfpu=fpv4-sp-d16
CFLAGS  = -Os -std=c99 -ggdb -Wall -Wextra -Wshadow -Wimplicit-function-declaration \
          -Wredundant-decls -Wmissing-prototypes -Wstrict-prototypes \
          -fno-common -ffunction-sections -fdata-sections \
          $(CPU) $(OPENCM3_INC) -D$(shell echo $(OPENCM3_TARGET) | tr a-z A-Z)
LDLIBS  = -L$(OPENCM3_DIR)/lib -lopencm3_$(OPENCM3_TARGET) -Wl,--gc-sections \
          -Wl,--start-group -lc -lgcc -lnosys -Wl,--end-group
LDFLAGS = -nostartfiles -T$(LDSCRIPT)

# ---- Build rules ----
.PHONY: all clean flash size

all: $(TARGET).bin size

$(TARGET).elf: $(SRC)
	$(CC) $(CFLAGS) $(LDFLAGS) $^ $(LDLIBS) -o $@

$(TARGET).bin: $(TARGET).elf
	$(OBJCOPY) -O binary $< $@

size: $(TARGET).elf
	$(SIZE) $<

flash: $(TARGET).bin
	$(STFLASH) write $< 0x08000000

clean:
	rm -f *.elf *.bin *.o *.d *.map *.list
