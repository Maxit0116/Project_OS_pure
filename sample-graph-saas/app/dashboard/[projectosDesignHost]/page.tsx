/*
 * ProjectOS-managed design-host route. This is a development/verification
 * surface for the dashboard canvas, not a product feature.
 *
 * Next App Router treats leading-underscore folders as private implementation
 * folders, so the file uses a dynamic segment while fail-closed matching the
 * public exact segment /dashboard/__projectos-design-host.
 */
import { notFound } from 'next/navigation'

import DesignHostClient from './DesignHostClient'

export const dynamic = 'force-dynamic'

const DESIGN_HOST_SEGMENT = '__projectos-design-host'

interface ProjectOSDashboardDesignHostPageProps {
  params: {
    projectosDesignHost: string
  }
}

export default function ProjectOSDashboardDesignHostPage(
  props: ProjectOSDashboardDesignHostPageProps,
) {
  if (
    process.env.NODE_ENV === 'production' ||
    props.params.projectosDesignHost !== DESIGN_HOST_SEGMENT
  ) {
    notFound()
  }
  return <DesignHostClient />
}
