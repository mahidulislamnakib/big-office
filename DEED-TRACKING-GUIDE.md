# Officer Deed Tracking System - User Guide

## Overview
The Deed Tracking System is a comprehensive performance management feature that allows tracking of both positive achievements (good deeds) and incidents/violations (bad deeds) for each officer.

## Features

### 1. Point-Based Performance System
- **Good Deeds**: Add positive points (e.g., Excellence +10, Leadership +15)
- **Bad Deeds**: Deduct points (e.g., Tardiness -5, Misconduct -15)
- **Total Points**: Automatically calculated from all verified deeds
- **Performance Rating**: 6-tier system based on total points

### 2. Performance Ratings
| Rating | Points Range | Description |
|--------|--------------|-------------|
| Exceptional | ≥100 points | Outstanding performance |
| Excellent | 50-99 points | Very strong performance |
| Good | 20-49 points | Above average performance |
| Average | 0-19 points | Meeting expectations |
| Below Average | -1 to -20 points | Needs improvement |
| Poor | <-20 points | Significant issues |

### 3. Deed Categories

**Good Deed Categories (10):**
- Excellence in Work (+10 pts)
- Leadership (+15 pts)
- Innovation & Creativity (+12 pts)
- Teamwork & Collaboration (+8 pts)
- Punctuality & Attendance (+5 pts)
- Initiative & Proactivity (+10 pts)
- Mentorship (+12 pts)
- Customer Service (+10 pts)
- Safety Compliance (+8 pts)
- Awards & Recognition (+20 pts)

**Bad Deed Categories (10):**
- Tardiness/Absence (-5 pts)
- Misconduct (-15 pts)
- Negligence (-10 pts)
- Insubordination (-12 pts)
- Safety Violation (-15 pts)
- Ethics Violation (-20 pts)
- Policy Violation (-10 pts)
- Poor Work Quality (-8 pts)
- Customer Complaint (-12 pts)
- Disciplinary Action (-25 pts)

### 4. Verification Workflow
- **Pending**: Initial status when deed is recorded
- **Verified**: Approved by HR/Admin (counts toward performance)
- **Rejected**: Denied by HR/Admin (does not affect performance)

## How to Use

### Access Requirements
- **Record Deeds**: Admin, HR, or Manager roles
- **Verify/Reject Deeds**: Admin or HR roles only
- **Delete Deeds**: Admin role only
- **View Deeds**: All users can view (subject to confidential flag)

### Recording a Deed

1. Navigate to officer profile page
2. Click the "⭐ Performance" tab
3. Click the "📝 Record Deed" button (visible to Admin/HR/Manager)
4. Fill in the form:
   - **Type**: Select Good Deed or Incident/Violation
   - **Category**: Choose from predefined categories (auto-loads based on type)
   - **Title**: Brief description (required)
   - **Date**: When the deed occurred (required)
   - **Severity**: Minor, Moderate, Major, or Critical (optional)
   - **Points**: Auto-populated from category (read-only)
   - **Description**: Detailed information (optional)
   - **Remarks**: Additional notes (optional)
   - **Confidential**: Check to restrict access
5. Click "Save Deed"

### Viewing Performance

**Statistics Cards:**
- Good Deeds Count (verified only)
- Incidents Count (verified only)
- Total Points
- Current Performance Rating

**Filters:**
- All Deeds
- Good Deeds only
- Incidents only
- Pending Review

**Deed Cards Display:**
- Title with icon (✅ good / ❌ bad)
- Date, category, severity, points
- Description and remarks
- Verification badge (verified/pending/rejected)
- Reporter and verifier information
- Action buttons (if authorized)

### Verifying Deeds (HR/Admin)

1. View deed in pending status
2. Click "✓ Verify" to approve (adds points to officer's total)
3. Click "✗ Reject" to deny (does not affect officer's score)
4. Officer's statistics update automatically after verification

### API Endpoints

```
GET /api/deed-categories
  - List all deed categories
  - Filter by type: ?type=good or ?type=bad

GET /api/officers/:id/deeds
  - Get all deeds for an officer
  - Filter by type: ?deed_type=good or ?deed_type=bad
  - Filter by status: ?verification_status=pending

POST /api/officers/:id/deeds
  - Create new deed (requires admin/hr/manager)
  - Body: { deed_type, category, title, deed_date, severity, points, description, remarks, is_confidential }

PUT /api/officers/:officerId/deeds/:deedId
  - Update deed or change verification status (requires admin/hr)
  - Body: { verification_status: 'verified' | 'rejected' | 'pending' }

DELETE /api/officers/:officerId/deeds/:deedId
  - Delete deed record (requires admin only)
```

## Database Schema

### officer_deeds Table
- `id`: Primary key
- `officer_id`: Foreign key to officers
- `deed_type`: 'good' or 'bad'
- `title`: Brief description
- `description`: Detailed information
- `deed_date`: Date of occurrence
- `severity`: minor/moderate/major/critical
- `points`: Point value (positive or negative)
- `category`: Category name
- `reported_by`: Username who recorded
- `verified_by`: Username who verified
- `verification_date`: When verified
- `verification_status`: pending/verified/rejected
- `attachments`: JSON array (future use)
- `remarks`: Additional notes
- `is_confidential`: 0 or 1
- `created_at`, `updated_at`: Timestamps

### deed_categories Table
- `id`: Primary key
- `type`: 'good' or 'bad'
- `name`: Category name
- `points`: Default point value
- `description`: Category description
- `created_at`: Timestamp

### Officers Table (Added Columns)
- `good_deeds_count`: Count of verified good deeds
- `bad_deeds_count`: Count of verified bad deeds
- `deed_points_total`: Sum of verified deed points
- `performance_rating`: exceptional/excellent/good/average/below_average/poor

## Best Practices

1. **Timely Recording**: Record deeds as soon as possible after occurrence
2. **Accurate Details**: Provide clear titles and descriptions
3. **Consistent Verification**: Review and verify/reject pending deeds regularly
4. **Confidential Use**: Use confidential flag for sensitive personnel matters
5. **Category Selection**: Choose appropriate category for accurate point allocation
6. **Documentation**: Use description and remarks fields for audit trail

## Security Features

- Role-based access control (Admin/HR/Manager for recording)
- Audit trail (recorded_by, verified_by, timestamps)
- Confidential deeds flag
- Field-level visibility controls
- JWT authentication required for all API calls

## Future Enhancements

- Attachments upload (evidence, documents)
- Export/reporting functionality
- Performance trend charts
- Email notifications for verifications
- Bulk deed import
- Custom deed categories

## Support

For questions or issues with the Deed Tracking System:
1. Check this guide first
2. Verify role permissions
3. Review server logs for errors
4. Contact system administrator

---
**Version**: 1.0  
**Last Updated**: December 5, 2025  
**Status**: Production Ready ✅
