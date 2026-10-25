import type { StatusViagem } from '@/lib/api';

// Dados de contato (um só lugar para editar). Usados pela home e pela página da viagem.
export const WHATSAPP_NUMERO = '5513981211993';
export const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMERO}`;
export const WHATSAPP_TEXTO = '(13) 98121-1993';
export const EMAIL = 'contato@macferrturismo.com.br';
export const INSTAGRAM_URL = 'https://instagram.com/macferrturismo';
export const INSTAGRAM_USER = '@macferrturismo';
export const ENDERECO = 'Av. Brasil, Jardim Casqueiro, 395';
export const CIDADE = 'Cubatão – SP';
export const MAPS_URL = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`${ENDERECO}, Cubatão, SP`);

/** Mensagem de interesse personalizada com o nome da viagem e adequada ao status dela. */
export function mensagemViagem(titulo: string, status: StatusViagem = 'Disponivel'): string {
  if (status === 'Finalizada') {
    return `Olá! Vi a viagem "${titulo}" no site da MacFerr e gostaria de saber se haverá uma nova saída para esse destino.`;
  }
  if (status === 'Esgotada') {
    return `Olá! Vi que a viagem "${titulo}" está esgotada e gostaria de entrar na lista de espera ou saber de novas saídas.`;
  }
  return `Olá! Tenho interesse na viagem "${titulo}" e gostaria de saber mais detalhes (datas, valores e formas de pagamento).`;
}

export const whatsappViagem = (titulo: string, status: StatusViagem = 'Disponivel') =>
  `${WHATSAPP_URL}?text=${encodeURIComponent(mensagemViagem(titulo, status))}`;

export const emailViagem = (titulo: string, status: StatusViagem = 'Disponivel') =>
  `mailto:${EMAIL}?subject=${encodeURIComponent(`Interesse na viagem: ${titulo}`)}&body=${encodeURIComponent(mensagemViagem(titulo, status))}`;
