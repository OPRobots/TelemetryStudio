/*
 * PoC 1 — STM32 telemetry test firmware (libopencm3)
 *
 * Sends CSV telemetry lines at ~1 kHz over UART (115200 baud by default).
 * Format per line:  timestamp_ms,accX,accY,accZ,gyroX,gyroY,gyroZ,battery
 *
 * Targets: STM32F4xx (Nucleo-F401RE / Nucleo-F446RE)
 *          easily adaptable to STM32F1/F0/L1 by changing the Makefile OPENCM3_TARGET.
 *
 * Build:
 *   make              # needs arm-none-eabi-gcc + libopencm3 installed
 *   make flash         # via st-flash or openocd
 */

#include <libopencm3/stm32/rcc.h>
#include <libopencm3/stm32/gpio.h>
#include <libopencm3/stm32/usart.h>
#include <libopencm3/cm3/systick.h>
#include <math.h>
#include <stdio.h>
#include <string.h>

/* ---------- Pin helpers (Nucleo-F4 USART2 = PA2 TX, PA3 RX) ---------- */
#define USART_CONSOLE USART2
#define UART_GPIO_PORT GPIOA
#define UART_GPIO_TX  GPIO2
#define UART_GPIO_RX  GPIO3

/* ---------- SysTick microsecond counter ---------- */
static volatile uint32_t systick_us = 0;

void sys_tick_handler(void)
{
    systick_us++;
}

static void clock_setup(void)
{
    /* 168 MHz from 8 MHz HSE (Nucleo) */
    rcc_clock_setup_pll(&rcc_hse_8mhz_3v3[RCC_CLOCK_PLL48_168MHZ]);

    /* Enable peripheral clocks */
    rcc_periph_clock_enable(RCC_GPIOA);
    rcc_periph_clock_enable(RCC_USART2);
}

static void gpio_setup(void)
{
    /* PA2 = AF7 (USART2 TX), PA3 = AF7 (USART2 RX) */
    gpio_mode_setup(UART_GPIO_PORT, GPIO_MODE_AF, GPIO_PUPD_NONE, UART_GPIO_TX | UART_GPIO_RX);
    gpio_af_config(UART_GPIO_PORT, UART_GPIO_TX, GPIO_AF7);
    gpio_af_config(UART_GPIO_PORT, UART_GPIO_RX, GPIO_AF7);

    /* On-board LED (PA5 on Nucleo-F4) for heartbeat */
    gpio_mode_setup(GPIOA, GPIO_MODE_OUTPUT, GPIO_PUPD_NONE, GPIO5);
}

static void usart_setup(uint32_t baud)
{
    usart_set_baudrate(USART_CONSOLE, baud);
    usart_set_databits(USART_CONSOLE, 8);
    usart_set_stopbits(USART_CONSOLE, USART_STOPBITS_1);
    usart_set_parity(USART_CONSOLE, USART_PARITY_NONE);
    usart_set_flow_control(USART_CONSOLE, USART_FLOWCONTROL_NONE);

    /* Enable both TX and RX */
    usart_enable_tx(USART_CONSOLE);
    usart_enable_rx(USART_CONSOLE);
}

static void systick_setup(void)
{
    /* 168 MHz / 1000 = 168000 ticks per ms → 1 tick = 1 µs */
    systick_set_clocksource(STK_CSR_CLKSOURCE_AHB_DIV8);
    /* AHB/8 = 21 MHz → reload for 1 ms = 21000 */
    systick_set_reload(21000 - 1);
    systick_interrupt_enable();
    systick_counter_enable();
}

static void delay_us(uint32_t us)
{
    uint32_t start = systick_us;
    while ((systick_us - start) < us)
        ;
}

/* ---------- retarget libc printf to USART2 ---------- */
int _write(int fd, char *ptr, int len)
{
    (void)fd;
    for (int i = 0; i < len; i++) {
        usart_send_blocking(USART_CONSOLE, (uint8_t)ptr[i]);
    }
    return len;
}

/* ---------- Simple sine/cosine test data generator ---------- */
int main(void)
{
    clock_setup();
    gpio_setup();
    usart_setup(115200);
    systick_setup();

    uint32_t frame = 0;

    while (1) {
        uint32_t now_ms = systick_us / 1000;
        float t = (float)now_ms * 0.001f; /* seconds */

        float accX  = sinf(t * 6.28f) * 9.8f;
        float accY  = cosf(t * 6.28f) * 9.8f;
        float accZ  = 9.8f + sinf(t * 3.14f) * 0.5f;
        float gyroX = sinf(t * 9.42f) * 180.0f;
        float gyroY = cosf(t * 9.42f) * 180.0f;
        float gyroZ = 0.0f;
        float battery = 100.0f - ((float)frame * 0.001f);

        printf("%lu,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f\r\n",
               (unsigned long)now_ms,
               (double)accX,  (double)accY,  (double)accZ,
               (double)gyroX, (double)gyroY, (double)gyroZ,
               (double)battery);

        frame++;

        /* Heartbeat toggle every 500 frames */
        if ((frame % 500) == 0)
            gpio_toggle(GPIOA, GPIO5);

        /* ~1 ms per frame (subtract processing time) */
        delay_us(1000);
    }

    return 0;
}
