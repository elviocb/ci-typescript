import * as core from "@actions/core"
import * as github from "@actions/github"
import {WebhookPayload} from "@actions/github/lib/interfaces"

type Label = {
  name: string
}

type PullRequest = WebhookPayload["pull_request"] & {
  title?: string
  labels: Label[]
}

const TICKET_REGEX = /[[a-z0-9]{6,8}]/
const TICKET_BASE_URL = "https://app.clickup.com/t/"
const LINKED_TICKET_REGEX = new RegExp(TICKET_BASE_URL)
const NOT_LINKED_TICKET_REGEX = /[[a-z0-9]{6,8}]\r?\n/
const SQUARE_BRACKETS_REGEX = /[\[\]]/g
const BYPASS_LABEL = "no-ticket"
const SUCCESS_MESSAGE = "Thank you for connection the PR with a ticket."
const BYPASS_MESSAGE = "The label to bypass this check was found, no checks will be performed."

const setErrorMessage = (type: "body" | "title") =>
  core.setFailed(
    `Please connect the PR's ${type} to a ticket or add the "${BYPASS_LABEL}" label to bypass this check.`
  )

const linkTicketToBody = (body?: string) => {
  const isAlreadyLinked = body?.match(LINKED_TICKET_REGEX)
  if (isAlreadyLinked) {
    core.info("::info:: Skipped linking.")
    return
  }

  const bodyMatch = body?.match(NOT_LINKED_TICKET_REGEX)
  if (!bodyMatch) {
    core.warning("::warn:: Could not link the ticket.")
    return
  }

  const ticketNumber = bodyMatch[0].trim().replace(SQUARE_BRACKETS_REGEX, "")

  return body?.replace(
    NOT_LINKED_TICKET_REGEX,
    `[${ticketNumber}](${TICKET_BASE_URL + ticketNumber})`
  )
}

async function run() {
  try {
    const inputs = {
      token: core.getInput("token"),
      ignoreTitle: core.getBooleanInput("ignore-title", {required: false}),
      ignoreBody: core.getBooleanInput("ignore-body", {required: false})
    }

    const octokit = github.getOctokit(inputs.token)
    const pullRequest = github.context.payload.pull_request as PullRequest
    const {body, title, labels, number} = pullRequest || {}

    const shouldBypass = labels.map(label => label.name).includes(BYPASS_LABEL)
    const titleMatches = title?.match(TICKET_REGEX)
    const bodyMatches = body?.match(TICKET_REGEX)

    if (shouldBypass) {
      core.info(`::info:: ${BYPASS_MESSAGE}`)
      return
    }

    if (!titleMatches && !inputs.ignoreTitle) {
      setErrorMessage("title")
      return
    }

    if (!bodyMatches) {
      setErrorMessage("body")
      return
    }

    const updatedBody = linkTicketToBody(body)

    if (updatedBody) {
      const request = {
        ...github.context.repo,
        title,
        body: updatedBody,
        pull_number: number
      }
      const response = await octokit.rest.pulls.update(request)

      core.info(`::info:: Response: ${response.status}`)
      if (response.status !== 200) {
        core.error("::error:: Updating the pull request has failed")
      }
    }

    core.info(`::info:: ${SUCCESS_MESSAGE}`)
  } catch (error) {
    if (error instanceof Error) {
      core.error(error)
      core.setFailed(error.message)
    }
  }
}

run()
