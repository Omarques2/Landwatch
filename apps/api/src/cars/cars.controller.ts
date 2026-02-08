import { Controller, Get, Query } from '@nestjs/common';
import { CarsService } from './cars.service';
import { BboxCarsQuery } from './dto/bbox-cars.query';
import { ByKeyCarsQuery } from './dto/by-key-cars.query';
import { LookupCarsQuery } from './dto/lookup-cars.query';
import { NearbyCarsQuery } from './dto/nearby-cars.query';
import { PointCarsQuery } from './dto/point-cars.query';

@Controller('v1/cars')
export class CarsController {
  constructor(private readonly cars: CarsService) {}

  @Get('lookup')
  lookup(@Query() query: LookupCarsQuery) {
    return this.cars.lookupByPoint(query);
  }

  @Get('by-key')
  getByKey(@Query() query: ByKeyCarsQuery) {
    return this.cars.getByKey(query);
  }

  @Get('bbox')
  bbox(@Query() query: BboxCarsQuery) {
    return this.cars.bbox(query);
  }

  @Get('nearby')
  nearby(@Query() query: NearbyCarsQuery) {
    return this.cars.nearby(query);
  }

  @Get('point')
  point(@Query() query: PointCarsQuery) {
    return this.cars.point(query);
  }
}
