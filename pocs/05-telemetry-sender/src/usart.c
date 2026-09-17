#include "usart.h"

int _write(int file, char *ptr, int len)
{
	int i = 0;

	if (file > 2) {
		return -1;
	}
	while (*ptr && (i < len)) {
		usart_send_blocking(USART1, *ptr);
		i++;
		ptr++;
	}
	return i;
}
