import { BadRequestException } from '@nestjs/common';

type GeeDates = {
  operation: 'image' | 'deforestation';
  startDate: string;
  endDate: string;
};

function validDay(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function assertGeeDates(
  dates: GeeDates,
  today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
  }).format(new Date()),
) {
  const reject = (message: string): never => {
    throw new BadRequestException({ code: 'GEE_INVALID_DATE_RANGE', message });
  };
  if (
    !validDay(dates.startDate) ||
    !validDay(dates.endDate) ||
    dates.startDate >= dates.endDate
  ) {
    reject(
      'Informe datas válidas; a data inicial deve ser anterior à data final.',
    );
  }
  if (dates.operation !== 'deforestation') return { ...dates };
  if (dates.startDate < '1984-03-16' || dates.endDate > today) {
    reject('Escolha um intervalo entre 16/03/1984 e hoje.');
  }
  // Preserve the original L5 × L8 comparison: never substitute either sensor.
  if (dates.startDate >= '2012-05-06') {
    reject(
      'Comparação indisponível: o intervalo não inclui Landsat 5 (até 05/05/2012). O Backend original exige os dois sensores.',
    );
  }
  if (dates.endDate <= '2013-03-18') {
    reject(
      'Comparação indisponível: o intervalo não inclui Landsat 8 (a partir de 18/03/2013). O Backend original exige os dois sensores.',
    );
  }
  return {
    ...dates,
    beforeStartDate: dates.startDate,
    // filterDate excludes the end date; May 6 includes the final L5 day.
    beforeEndDate: '2012-05-06',
    startDate: '2013-03-18',
  };
}
