import type { ActionDefinition } from '@segment/actions-core'
import type { Settings } from '../generated-types'
import type { Payload } from './generated-types'
import { PayloadValidationError } from '@segment/actions-core'
import { API_URL } from '../config'
import { batch_size, enable_batching, country_code } from '../properties'
import { processPhoneNumber, sendBatchedTrackEvent } from '../functions'
import dayjs from '../../../lib/dayjs'

const action: ActionDefinition<Settings, Payload> = {
  title: 'Track Event',
  description: 'Track user events and associate it with their profile.',
  defaultSubscription: 'type = "track"',
  fields: {
    profile: {
      label: 'Profile',
      description: `Properties of the profile that triggered this event.`,
      type: 'object',
      properties: {
        email: {
          label: 'Email',
          type: 'string',
          description: `The user's email to send to Klavio.`,
          format: 'email'
        },
        phone_number: {
          label: 'Phone Number',
          type: 'string'
        },
        country_code: {
          ...country_code
        },
        external_id: {
          label: 'External Id',
          description:
            'A unique identifier used by customers to associate Klaviyo profiles with profiles in an external system.',
          type: 'string',
          default: { '@path': '$.userId' }
        },
        anonymous_id: {
          label: 'Anonymous Id',
          description: 'Anonymous user identifier for the user.',
          type: 'string',
          default: { '@path': '$.anonymousId' }
        }
      },
      additionalProperties: true,
      required: true
    },
    metric_name: {
      label: 'Metric Name',
      description: 'Name of the event. Must be less than 128 characters.',
      type: 'string',
      default: {
        '@path': '$.event'
      },
      required: true
    },
    properties: {
      description: `Properties of this event.`,
      label: 'Properties',
      type: 'object',
      default: {
        '@path': '$.properties'
      },
      required: true
    },
    time: {
      label: 'Time',
      description: `When this event occurred. By default, the time the request was received will be used.
      The time is truncated to the second. The time must be after the year 2000 and can only
      be up to 1 year in the future.
      `,
      type: 'datetime',
      default: {
        '@path': '$.timestamp'
      }
    },
    value: {
      label: 'Value',
      description: 'A numeric value to associate with this event. For example, the dollar amount of a purchase.',
      type: 'number'
    },
    unique_id: {
      label: 'Unique ID',
      description: `A unique identifier for an event. If the unique_id is repeated for the same
      profile and metric, only the first processed event will be recorded. If this is not
      present, this will use the time to the second. Using the default, this limits only one
      event per profile per second.
      `,
      type: 'string',
      default: {
        '@path': '$.messageId'
      }
    },
    enable_batching: { ...enable_batching },
    batch_size: { ...batch_size, default: 1000 }
  },
  perform: (request, { payload }) => {
    const { email, phone_number: initialPhoneNumber, external_id, anonymous_id, country_code } = payload.profile

    const phone_number = processPhoneNumber(initialPhoneNumber, country_code)
    payload.profile.phone_number = phone_number
    delete payload?.profile?.country_code

    if (!email && !phone_number && !external_id && !anonymous_id) {
      throw new PayloadValidationError('One of External ID, Anonymous ID, Phone Number or Email is required.')
    }
    const eventData = {
      data: {
        type: 'event',
        attributes: {
          properties: { ...payload.properties },
          time: payload?.time ? dayjs(payload.time).toISOString() : undefined,
          value: payload.value,
          unique_id: payload.unique_id,
          metric: {
            data: {
              type: 'metric',
              attributes: {
                name: payload.metric_name
              }
            }
          },
          profile: {
            data: {
              type: 'profile',
              attributes: payload.profile
            }
          }
        }
      }
    }
    return request(`${API_URL}/events/`, {
      method: 'POST',
      json: eventData
    })
  },
  performBatch: (request, { payload }) => {
    return sendBatchedTrackEvent(request, payload)
  }
}

export default action
