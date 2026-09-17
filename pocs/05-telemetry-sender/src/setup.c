#include "setup.h"

static void setup_clock(void) {
  rcc_clock_setup_pll(&rcc_hse_25mhz_3v3[RCC_CLOCK_3V3_84MHZ]);

  rcc_periph_clock_enable(RCC_GPIOA);
  rcc_periph_clock_enable(RCC_GPIOB);
  rcc_periph_clock_enable(RCC_USART1);

  dwt_enable_cycle_counter();
}

static void setup_systick(void) {
  systick_set_frequency(SYSTICK_FREQUENCY_HZ, SYSCLK_FREQUENCY_HZ);
  systick_counter_enable();
  systick_interrupt_enable();
}

static void setup_gpio(void) {
  /* LED heartbeat (PB12) */
  gpio_mode_setup(GPIOB, GPIO_MODE_OUTPUT, GPIO_PUPD_NONE, GPIO12);
  gpio_set(GPIOB, GPIO12);

  /* USART1 TX/RX (PA9/PA10, AF7) — debug console */
  gpio_mode_setup(GPIOA, GPIO_MODE_AF, GPIO_PUPD_NONE, GPIO9 | GPIO10);
  gpio_set_af(GPIOA, GPIO_AF7, GPIO9 | GPIO10);
}

static void setup_usart(void) {
  usart_set_baudrate(USART1, 115200);
  usart_set_databits(USART1, 8);
  usart_set_stopbits(USART1, USART_STOPBITS_1);
  usart_set_parity(USART1, USART_PARITY_NONE);
  usart_set_flow_control(USART1, USART_FLOWCONTROL_NONE);
  usart_set_mode(USART1, USART_MODE_TX_RX);
  usart_enable(USART1);
}

void setup(void) {
  setup_clock();
  setup_systick();
  setup_gpio();
  setup_usart();
}
