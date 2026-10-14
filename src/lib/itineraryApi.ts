import { GeoRequestError, requestGeoJson } from './geoApi';
import { roundRouteStop } from './routing';
import { ItineraryRequest, ItineraryResponse, ItineraryStatus } from './itinerary';

const unexpected = () => new GeoRequestError('The server sent an unexpected reply. Please try again.', 'BAD_RESPONSE');

export async function fetchItineraryStatus(signal?: AbortSignal): Promise<ItineraryStatus> {
  const data = await requestGeoJson<ItineraryStatus>('/api/itinerary/status', signal);
  if (typeof data.aiConfigured !== 'boolean' || typeof data.routingConfigured !== 'boolean') throw unexpected();
  return data;
}

/**
 * Asks the server for an AI itinerary. A starting point is rounded to about
 * 11 m before it leaves the browser. A reply without exactly the requested
 * number of days, each with stops and a route status, is an error.
 */
export async function requestItinerary(request: ItineraryRequest, signal?: AbortSignal): Promise<ItineraryResponse> {
  const start =
    request.start.type === 'point'
      ? { ...request.start, ...roundRouteStop({ lat: request.start.lat, lon: request.start.lon }) }
      : request.start;
  const data = await requestGeoJson<ItineraryResponse>('/api/itinerary/generate', signal, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...request, start }),
  });
  if (
    !Array.isArray(data.days) ||
    data.days.length !== request.days ||
    !data.days.every(d => Array.isArray(d.stops) && d.stops.length > 0 && d.route && typeof d.route.status === 'string')
  ) {
    throw unexpected();
  }
  return data;
}
